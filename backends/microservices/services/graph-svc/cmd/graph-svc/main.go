package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/PrashantGC00/z/backends/microservices/services/graph-svc/internal/config"
	httpServer "github.com/PrashantGC00/z/backends/microservices/services/graph-svc/internal/http"
	"github.com/PrashantGC00/z/backends/microservices/services/graph-svc/internal/platform"
)

func main() {
	if err := run(); err != nil {
		slog.Error("service failed", "error", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("load config: %w", err)
	}

	level, err := cfg.ParsedLogLevel()
	if err != nil {
		return fmt.Errorf("parse log level: %w", err)
	}

	logger := platform.NewLogger(level)
	slog.SetDefault(logger)

	ctx, stop := signal.NotifyContext(
		context.Background(),
		os.Interrupt,
		syscall.SIGTERM,
	)
	defer stop()

	shutdownTracer, err := platform.InitTracer(
		ctx,
		cfg.OTelServiceName,
		cfg.OTelExporter,
	)
	if err != nil {
		return fmt.Errorf("init tracer: %w", err)
	}

	defer func() {
		sctx, cancel := context.WithTimeout(
			context.Background(),
			5*time.Second,
		)
		defer cancel()

		if err := shutdownTracer(sctx); err != nil {
			logger.Error("shutdown tracer", "error", err)
		}
	}()

	pool, err := platform.NewDatabase(ctx, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("initialize database: %w", err)
	}
	defer pool.Close()

	server := httpServer.New(httpServer.Options{
		Logger:       logger,
		Pinger:       pool,
		ReadyTimeout: cfg.ReadyTimeout,
	})

	listenErr := make(chan error, 1)

	logger.Info("service is starting", "port", cfg.Port)

	go func() {
		listenErr <- server.Listen(fmt.Sprintf(":%d", cfg.Port))
	}()

	select {
	case err := <-listenErr:
		if err != nil {
			return fmt.Errorf("server stopped unexpectedly: %w", err)
		}

		return nil

	case <-ctx.Done():
		logger.Info("shutdown signal received")

		shutdownCtx, cancel := context.WithTimeout(
			context.Background(),
			cfg.ShutdownTimeout,
		)
		defer cancel()

		if err := server.Shutdown(shutdownCtx); err != nil {
			return fmt.Errorf("shutdown HTTP server: %w", err)
		}

		logger.Info("service shutdown complete")
		return nil
	}
}
