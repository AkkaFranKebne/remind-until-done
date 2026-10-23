package config

import "testing"

func TestLoadDefaults(t *testing.T) {
	t.Setenv("ENV", "")
	t.Setenv("PORT", "")
	t.Setenv("DATABASE_URL", "")
	t.Setenv("GCP_PROJECT", "rud-dev-4f7k2")
	t.Setenv("INTERNAL_AUTH", "off")

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
	t.Setenv("GCP_PROJECT", "rud-dev-4f7k2")
	t.Setenv("ALLOWED_EMAILS", "a@example.com")
	t.Setenv("SERVICE_URL", "https://rud-api.run.app")
	t.Setenv("INVOKER_SA_EMAIL", "rud-invoker-dev@rud-dev-4f7k2.iam.gserviceaccount.com")
	t.Setenv("INTERNAL_AUTH", "")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.Env != "dev" || cfg.Port != "9000" || cfg.DatabaseURL != "postgres://u:p@neon/rud" ||
		cfg.GCPProject != "rud-dev-4f7k2" || cfg.AllowedEmails != "a@example.com" ||
		cfg.ServiceURL != "https://rud-api.run.app" || cfg.InvokerEmail == "" || cfg.InternalAuthOff {
		t.Errorf("Load() = %+v, want the values from the environment", cfg)
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
			t.Setenv("GCP_PROJECT", "rud-dev-4f7k2") // so only the missing database can fail
			setInternalAuth(t)

			if _, err := Load(); err == nil {
				t.Errorf("Load() error = nil, want an error: %s must not fall back to the local database", env)
			}
		})
	}
}

func TestLoadRefusesTheAuthEmulatorOutsideLocal(t *testing.T) {
	t.Setenv("ENV", "prod")
	t.Setenv("DATABASE_URL", "postgres://u:p@neon/rud")
	t.Setenv("GCP_PROJECT", "rud-prod-4f7k2")
	t.Setenv("FIREBASE_AUTH_EMULATOR_HOST", "localhost:9099")
	setInternalAuth(t)

	if _, err := Load(); err == nil {
		t.Error("Load() error = nil, want an error: the emulator setting turns off token signature checks")
	}
}

func TestLoadRequiresGCPProject(t *testing.T) {
	t.Setenv("ENV", "local")
	t.Setenv("GCP_PROJECT", "")
	t.Setenv("INTERNAL_AUTH", "off")

	if _, err := Load(); err == nil {
		t.Error("Load() error = nil, want an error: without a project no token can be checked")
	}
}

// setInternalAuth gives the /internal check valid settings, so a test fails only for its own reason.
func setInternalAuth(t *testing.T) {
	t.Setenv("INTERNAL_AUTH", "")
	t.Setenv("SERVICE_URL", "https://rud-api.run.app")
	t.Setenv("INVOKER_SA_EMAIL", "inv@x.iam.gserviceaccount.com")
}

func TestLoadInternalAuth(t *testing.T) {
	tests := []struct {
		name, env, off, url, email string
		wantErr                    bool
	}{
		{"dev with the service URL and invoker", "dev", "", "https://rud-api.run.app", "inv@x.iam.gserviceaccount.com", false},
		{"dev without the service URL", "dev", "", "", "inv@x.iam.gserviceaccount.com", true},
		{"dev without the invoker", "dev", "", "https://rud-api.run.app", "", true},
		{"check off in dev", "dev", "off", "https://rud-api.run.app", "inv@x.iam.gserviceaccount.com", true},
		{"check off in prod", "prod", "off", "https://rud-api.run.app", "inv@x.iam.gserviceaccount.com", true},
		{"check off locally", "local", "off", "", "", false},
		{"local without the check settings", "local", "", "", "", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("ENV", tt.env)
			t.Setenv("DATABASE_URL", "postgres://u:p@neon/rud")
			t.Setenv("GCP_PROJECT", "rud-dev-4f7k2")
			t.Setenv("INTERNAL_AUTH", tt.off)
			t.Setenv("SERVICE_URL", tt.url)
			t.Setenv("INVOKER_SA_EMAIL", tt.email)

			if _, err := Load(); (err != nil) != tt.wantErr {
				t.Errorf("Load() error = %v, want error = %v", err, tt.wantErr)
			}
		})
	}
}
