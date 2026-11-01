package config

import (
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/caarlos0/env/v11"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Config struct {
	Port            int           `env:"PORT" envDefault:"8080"`
	LogLevel        string        `env:"LOG_LEVEL" envDefault:"info"`
	DatabaseURL     string        `env:"DATABASE_URL,required,notEmpty"`
	ReadyTimeout    time.Duration `env:"READY_TIMEOUT" envDefault:"2s"`
	ShutdownTimeout time.Duration `env:"SHUTDOWN_TIMEOUT" envDefault:"10s"`
}

func Load() (Config, error) {
	var cfg Config

	if err := env.Parse(&cfg); err != nil {
		return Config{}, fmt.Errorf("parse configuration: %w", err)
	}

	if err := cfg.Validate(); err != nil {
		return Config{}, fmt.Errorf("invalid configuration: %w", err)
	}

	return cfg, nil
}

func (cfg Config) Validate() error {
	var errs []error

	if cfg.Port < 1 || cfg.Port > 65535 {
		errs = append(errs, errors.New("PORT must be in 1 and 65535"))
	}

	switch strings.ToLower(cfg.LogLevel) {
	case "debug", "info", "warn", "error":
	default:
		errs = append(errs, fmt.Errorf("LOG_LEVEL must be debug|info|warn|error, got %q", cfg.LogLevel))
	}

	if strings.TrimSpace(cfg.DatabaseURL) != "" {
		if _, err := pgxpool.ParseConfig(cfg.DatabaseURL); err != nil {
			errs = append(errs, errors.New("DATABASE_URL is not a valid PostgreSQL connection URL"))
		}
	}

	if cfg.ReadyTimeout <= 0 {
		errs = append(errs, errors.New("READY_TIMEOUT must be greater than 0"))
	}

	if cfg.ShutdownTimeout <= 0 {
		errs = append(errs, errors.New("SHUTDOWN_TIMEOUT must be greater than 0"))
	}

	return errors.Join(errs...)
}

func (cfg Config) ParsedLogLevel() (slog.Level, error) {
	var level slog.Level

	err := level.UnmarshalText([]byte(cfg.LogLevel))
	return level, err
}
