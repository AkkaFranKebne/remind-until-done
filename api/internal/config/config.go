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
	"strings"
)

// LocalDatabaseURL is the Postgres from docker-compose.yml (make db-up).
const LocalDatabaseURL = "postgres://rud:rud@localhost:5432/rud?sslmode=disable"

type Config struct {
	Env           string // local, dev or prod
	Port          string // Cloud Run injects PORT; the server must listen on it
	DatabaseURL   string // secret: never log it
	GCPProject    string // Firebase project whose sign-in tokens are accepted
	AllowedEmails string // invite list, comma-separated (secret); empty = nobody

	// /internal/* callers (Cloud Tasks, Cloud Scheduler) prove who they are with a
	// Google ID token made for ServiceURL by InvokerEmail.
	ServiceURL      string
	InvokerEmail    string
	InternalAuthOff bool // INTERNAL_AUTH=off: no check, local only (nothing signs tokens there)

	// Pushes are booked as Cloud Tasks in this queue; each task calls ServiceURL as InvokerEmail.
	TasksLocation string
	TasksQueue    string
	SchedulerLog  bool // SCHEDULER=log: tasks are only logged, local only (Cloud Tasks can't call a laptop)
	PushLog       bool // PUSH=log: pushes are only logged, local only
}

func Load() (Config, error) {
	cfg := Config{
		Env:           getenv("ENV", "local"),
		Port:          getenv("PORT", "8080"),
		DatabaseURL:   os.Getenv("DATABASE_URL"),
		GCPProject:    os.Getenv("GCP_PROJECT"),
		AllowedEmails: os.Getenv("ALLOWED_EMAILS"),

		ServiceURL:      os.Getenv("SERVICE_URL"),
		InvokerEmail:    os.Getenv("INVOKER_SA_EMAIL"),
		InternalAuthOff: os.Getenv("INTERNAL_AUTH") == "off",

		TasksLocation: os.Getenv("TASKS_LOCATION"),
		TasksQueue:    os.Getenv("TASKS_QUEUE"),
		SchedulerLog:  os.Getenv("SCHEDULER") == "log",
		PushLog:       os.Getenv("PUSH") == "log",
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
	// The Firebase SDK skips the token signature check when this is set.
	if os.Getenv("FIREBASE_AUTH_EMULATOR_HOST") != "" && cfg.Env != "local" {
		return Config{}, errors.New("FIREBASE_AUTH_EMULATOR_HOST must never be set in dev or prod")
	}
	if cfg.InternalAuthOff && cfg.Env != "local" {
		return Config{}, errors.New("INTERNAL_AUTH=off must never be set in dev or prod")
	}
	if !cfg.InternalAuthOff && (cfg.ServiceURL == "" || cfg.InvokerEmail == "") {
		return Config{}, errors.New("SERVICE_URL and INVOKER_SA_EMAIL are required for the /internal check (locally, make run sets INTERNAL_AUTH=off)")
	}
	if cfg.SchedulerLog && cfg.Env != "local" {
		return Config{}, errors.New("SCHEDULER=log must never be set in dev or prod: no push would ever be sent")
	}
	if cfg.PushLog && cfg.Env != "local" {
		return Config{}, errors.New("PUSH=log must never be set in dev or prod: every nag would count as sent and none would arrive")
	}
	if !cfg.SchedulerLog && (cfg.TasksLocation == "" || cfg.TasksQueue == "" || cfg.ServiceURL == "" || cfg.InvokerEmail == "") {
		return Config{}, errors.New("TASKS_LOCATION, TASKS_QUEUE, SERVICE_URL and INVOKER_SA_EMAIL are required to book pushes (locally, make run sets SCHEDULER=log)")
	}
	if cfg.GCPProject == "" {
		return Config{}, errors.New("GCP_PROJECT is required (locally, make run sets the dev project)")
	}
	// Sign-in, Cloud Tasks and FCM all use this project. Project ids are rud-<env>-...: a dev
	// project in prod would send pushes no prod phone can get, and delete every device for it.
	if cfg.Env != "local" && !strings.HasPrefix(cfg.GCPProject, "rud-"+cfg.Env+"-") {
		return Config{}, fmt.Errorf("GCP_PROJECT %q is not a %s project (want rud-%s-...)", cfg.GCPProject, cfg.Env, cfg.Env)
	}
	return cfg, nil
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
