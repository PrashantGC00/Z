package http

import (
	"log/slog"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/requestid"
)

func accessLogMiddleware(logger *slog.Logger) fiber.Handler {
	return func(c fiber.Ctx) error {
		start := time.Now()

		err := c.Next()
		if err != nil {
			if handlerErr := c.App().ErrorHandler(c, err); handlerErr != nil {
				_ = c.SendStatus(fiber.StatusInternalServerError)
			}
		}

		logger.InfoContext(
			c.Context(),
			"http request",
			"request_id", requestid.FromContext(c),
			"method", c.Method(),
			"path", c.Path(),
			"status", c.Response().StatusCode(),
			"duration", time.Since(start).String(),
		)

		return nil
	}
}
