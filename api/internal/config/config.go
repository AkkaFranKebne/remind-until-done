// Package config reads the API settings from environment variables.
//
// Terraform (infra/cloud_run.tf) sets these on Cloud Run. Locally, the
// api/Makefile sets GCP_PROJECT and reads ALLOWED_EMAILS from api/.env.local.
// More settings are added here as the features that need them land.
package config

import (
	"errors"
	"fmt"
	"os"
)

// LocalDatabaseURL is the Postgres from docker-compose.yml (make db-up).
const LocalDatabaseURL = "postgres://rud:rud@localhost:5432/rud?sslmode=disable"

type Config struct {
	Env           string // local, dev or prod
	Port          string // Cloud Run injects PORT; the server must listen on it
	DatabaseURL   string // secret: never log it
	GCPProject    string // Firebase project whose sign-in tokens are accepted
	AllowedEmails string // invite list, comma-separated (secret); empty = nobody
}

func Load() (Config, error) {
	cfg := Config{
		Env:           getenv("ENV", "local"),
		Port:          getenv("PORT", "8080"),
		DatabaseURL:   os.Getenv("DATABASE_URL"),
		GCPProject:    os.Getenv("GCP_PROJECT"),
		AllowedEmails: os.Getenv("ALLOWED_EMAILS"),
	}
	switch cfg.Env {
	case "local", "dev", "prod":
	default:
		return Config{}, fmt.Errorf("ENV must be local, dev or prod, got %q", cfg.Env)
	}
	if cfg.DatabaseURL == "" {
		// Only local falls back to the docker database; dev and prod must never
		// silently talk to the wrong one.
		if cfg.Env != "local" {
			return Config{}, errors.New("DATABASE_URL is required when ENV is dev or prod")
		}
		cfg.DatabaseURL = LocalDatabaseURL
	}
	if cfg.GCPProject == "" {
		return Config{}, errors.New("GCP_PROJECT is required (locally, make run sets the dev project)")
	}
	return cfg, nil
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
