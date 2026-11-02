package http_test

import (
	"context"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	httpServer "github.com/PrashantGC00/z/backends/microservices/services/graph-svc/internal/http"
	"github.com/PrashantGC00/z/backends/microservices/services/graph-svc/internal/platform"
	"github.com/gofiber/fiber/v3"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
)

const readyTimeout = 2 * time.Second

func TestReadyz(t *testing.T) {
	t.Run("database available", func(t *testing.T) {
		container, databaseURL := startPostgres(t)
		t.Cleanup(func() { terminatePostgres(t, container) })

		pool, err := platform.NewDatabase(context.Background(), databaseURL)
		if err != nil {
			t.Fatalf("create database pool: %v", err)
		}
		t.Cleanup(pool.Close) // runs before terminate (LIFO)

		server := newServer(pool)

		response := sendReadyz(t, server)
		defer response.Body.Close()

		if response.StatusCode != http.StatusOK {
			t.Fatalf("expected status %d, got %d", http.StatusOK, response.StatusCode)
		}
	})

	t.Run("database unavailable", func(t *testing.T) {
		container, databaseURL := startPostgres(t)

		pool, err := platform.NewDatabase(context.Background(), databaseURL)
		if err != nil {
			terminatePostgres(t, container)
			t.Fatalf("create database pool: %v", err)
		}
		t.Cleanup(pool.Close)

		// Kill the database before the readiness check.
		terminatePostgres(t, container)

		server := newServer(pool)

		response := sendReadyz(t, server)
		defer response.Body.Close()

		if response.StatusCode != http.StatusServiceUnavailable {
			t.Fatalf("expected status %d, got %d", http.StatusServiceUnavailable, response.StatusCode)
		}

		mediaType, _, err := mime.ParseMediaType(response.Header.Get("Content-Type"))
		if err != nil {
			t.Fatalf("parse Content-Type %q: %v", response.Header.Get("Content-Type"), err)
		}
		if mediaType != "application/problem+json" {
			t.Fatalf("expected Content-Type application/problem+json, got %q", mediaType)
		}
	})
}

func newServer(pinger httpServer.Pinger) *httpServer.Server {
	return httpServer.New(httpServer.Options{
		Logger:       slog.New(slog.NewTextHandler(io.Discard, nil)),
		Pinger:       pinger,
		ReadyTimeout: readyTimeout,
	})
}

func sendReadyz(t *testing.T, server *httpServer.Server) *http.Response {
	t.Helper()

	request := httptest.NewRequest(http.MethodGet, "/readyz", nil)

	// Fiber's default test timeout is 1s, shorter than ReadyTimeout.
	// Give it ReadyTimeout plus headroom so a failing ping can finish.
	response, err := server.Test(request, fiber.TestConfig{
		Timeout:       readyTimeout + 3*time.Second,
		FailOnTimeout: true,
	})
	if err != nil {
		t.Fatalf("send readiness request: %v", err)
	}

	return response
}

func startPostgres(t *testing.T) (*postgres.PostgresContainer, string) {
	t.Helper()

	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	container, err := postgres.Run(
		ctx,
		"postgres:17-alpine",
		postgres.WithDatabase("graph_test"),
		postgres.WithUsername("test"),
		postgres.WithPassword("test"),
		postgres.BasicWaitStrategies(),
	)
	if err != nil {
		t.Fatalf("start PostgreSQL container: %v", err)
	}

	connectionString, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		terminatePostgres(t, container)
		t.Fatalf("get PostgreSQL connection string: %v", err)
	}

	return container, connectionString
}

func terminatePostgres(t *testing.T, container *postgres.PostgresContainer) {
	t.Helper()

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if err := container.Terminate(ctx); err != nil {
		t.Errorf("terminate PostgreSQL container: %v", err)
	}
}
