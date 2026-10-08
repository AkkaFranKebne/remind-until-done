package config

import "testing"

func TestLoadDefaults(t *testing.T) {
	t.Setenv("ENV", "")
	t.Setenv("PORT", "")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.Env != "local" || cfg.Port != "8080" {
		t.Errorf("Load() = %+v, want Env=local Port=8080", cfg)
	}
}

func TestLoadFromEnv(t *testing.T) {
	t.Setenv("ENV", "dev")
	t.Setenv("PORT", "9000")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.Env != "dev" || cfg.Port != "9000" {
		t.Errorf("Load() = %+v, want Env=dev Port=9000", cfg)
	}
}

func TestLoadRejectsUnknownEnv(t *testing.T) {
	t.Setenv("ENV", "staging")

	if _, err := Load(); err == nil {
		t.Error("Load() error = nil, want an error for ENV=staging")
	}
}
