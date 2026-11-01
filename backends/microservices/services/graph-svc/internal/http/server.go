package http

import (
	"context"
	"log/slog"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/requestid"
)

type Pinger interface {
	Ping(ctx context.Context) error
}

type Options struct {
	Logger       *slog.Logger
	Pinger       Pinger
	ReadyTimeout time.Duration
}

type Server struct {
	app          *fiber.App
	pinger       Pinger
	readyTimeout time.Duration
	logger       *slog.Logger
}

func New(opts Options) *Server {
	app := fiber.New(fiber.Config{
		ErrorHandler: errorHandler(opts.Logger),
	})

	app.Use(requestid.New(requestid.Config{
		Header: "X-Request-ID",
	}))
	app.Use(accessLogMiddleware(opts.Logger))

	server := &Server{
		app:          app,
		logger:       opts.Logger,
		pinger:       opts.Pinger,
		readyTimeout: opts.ReadyTimeout,
	}

	server.registerRoutes()

	return server
}

func (s *Server) readyz(c fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(c, s.readyTimeout)
	defer cancel()

	if err := s.pinger.Ping(ctx); err != nil {
		s.logger.Warn(
			"readiness check failed",
			"error", err,
			"request_id", requestid.FromContext(c),
		)

		return writeProblem(
			c,
			fiber.StatusServiceUnavailable,
			"Service Unavailable",
			"Database is not available",
		)
	}

	return c.JSON(fiber.Map{"status": "ok"})
}

func (s *Server) registerRoutes() {
	s.app.Get("/livez", func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})

	s.app.Get("/readyz", s.readyz)

	s.app.Use(func(c fiber.Ctx) error {
		return fiber.ErrNotFound
	})
}

func (s *Server) Listen(addr string) error {
	return s.app.Listen(addr, fiber.ListenConfig{
		DisableStartupMessage: true,
	})
}

func (s *Server) Shutdown(ctx context.Context) error {
	return s.app.ShutdownWithContext(ctx)
}
