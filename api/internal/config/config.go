// Package config reads the API settings from environment variables.
//
// Terraform (infra/cloud_run.tf) sets these on Cloud Run. Locally, the
// defaults are enough to run the server. More settings (DATABASE_URL,
// ALLOWED_EMAILS, ...) are added here as the features that need them land.
package config

import (
	"fmt"
	"os"
)

type Config struct {
	Env  string // local, dev or prod
	Port string // Cloud Run injects PORT; the server must listen on it
}

func Load() (Config, error) {
	cfg := Config{
		Env:  getenv("ENV", "local"),
		Port: getenv("PORT", "8080"),
	}
	switch cfg.Env {
	case "local", "dev", "prod":
	default:
		return Config{}, fmt.Errorf("ENV must be local, dev or prod, got %q", cfg.Env)
	}
	return cfg, nil
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
