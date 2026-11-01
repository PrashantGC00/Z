package http

import (
	"errors"
	"log/slog"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/requestid"
)

const (
	problemContentType = "application/problem+json"
)

type Problem struct {
	Type     string `json:"type"`
	Title    string `json:"title"`
	Status   int    `json:"status"`
	Detail   string `json:"detail,omitempty"`
	Instance string `json:"instance,omitempty"`
	TraceID  string `json:"traceId,omitempty"`
}

func writeProblem(c fiber.Ctx, status int, title, detail string) error {
	return c.Status(status).JSON(Problem{
		Type:     "about:blank",
		Title:    title,
		Status:   status,
		Detail:   detail,
		Instance: c.Path(),
	}, problemContentType)
}

func errorHandler(logger *slog.Logger) fiber.ErrorHandler {
	return func(c fiber.Ctx, err error) error {
		status := fiber.StatusInternalServerError
		title := "Internal Server Error"
		detail := "An unexpected error occurred."

		var fiberErr *fiber.Error

		if errors.As(err, &fiberErr) {
			status = fiberErr.Code
			title = fiberErr.Message
			detail = fiberErr.Message
		}

		if status >= 500 {
			logger.Error("http request failed",
				"error", err,
				"request_id", requestid.FromContext(c),
			)
		}

		return writeProblem(c, status, title, detail)
	}
}
