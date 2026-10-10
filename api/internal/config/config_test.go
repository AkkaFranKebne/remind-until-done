package config

import "testing"

func TestLoadDefaults(t *testing.T) {
	t.Setenv("ENV", "")
	t.Setenv("PORT", "")
	t.Setenv("DATABASE_URL", "")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.Env != "local" || cfg.Port != "8080" || cfg.DatabaseURL != LocalDatabaseURL {
		t.Errorf("Load() = %+v, want Env=local Port=8080 and the local database", cfg)
	}
}

func TestLoadFromEnv(t *testing.T) {
	t.Setenv("ENV", "dev")
	t.Setenv("PORT", "9000")
	t.Setenv("DATABASE_URL", "postgres://u:p@neon/rud")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.Env != "dev" || cfg.Port != "9000" || cfg.DatabaseURL != "postgres://u:p@neon/rud" {
		t.Errorf("Load() = %+v, want Env=dev Port=9000 and the given database", cfg)
	}
}

func TestLoadRejectsUnknownEnv(t *testing.T) {
	t.Setenv("ENV", "staging")

	if _, err := Load(); err == nil {
		t.Error("Load() error = nil, want an error for ENV=staging")
	}
}

func TestLoadRequiresDatabaseURLOutsideLocal(t *testing.T) {
	for _, env := range []string{"dev", "prod"} {
		t.Run(env, func(t *testing.T) {
			t.Setenv("ENV", env)
			t.Setenv("DATABASE_URL", "")

			if _, err := Load(); err == nil {
				t.Errorf("Load() error = nil, want an error: %s must not fall back to the local database", env)
			}
		})
	}
}
