package db_test

import (
	"context"
	"slices"
	"testing"

	"github.com/AkkaFranKebne/remind-until-done/api/internal/db"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/dbtest"
)

func TestOpenRejectsBadURLWithoutLeakingIt(t *testing.T) {
	_, err := db.Open(context.Background(), "postgres://user:s3cret@host:notaport/rud", false)
	if err == nil {
		t.Fatal("Open() error = nil, want an error for a bad URL")
	}
	if got := err.Error(); got != "DATABASE_URL is not a valid Postgres URL" {
		t.Errorf("Open() error = %q, must not quote the URL", got)
	}
}

func TestDevAndProdAlwaysVerifyTheServer(t *testing.T) {
	// What Neon's URL says, and weaker: none of them may switch the check off.
	for _, mode := range []string{"require", "prefer", "allow", "disable", "verify-ca"} {
		t.Run(mode, func(t *testing.T) {
			url := "postgres://u:p@ep-x-pooler.eu-central-1.aws.neon.tech/rud?sslmode=" + mode
			cfg, err := db.Config(url, true)
			if err != nil {
				t.Fatal(err)
			}
			tls := cfg.ConnConfig.TLSConfig
			if tls == nil || tls.InsecureSkipVerify || tls.ServerName != "ep-x-pooler.eu-central-1.aws.neon.tech" {
				t.Fatalf("TLS = %+v, want the certificate checked for the host", tls)
			}
			if tls.RootCAs != nil {
				t.Error("RootCAs set: want the system's trusted roots")
			}
			if len(cfg.ConnConfig.Fallbacks) != 0 {
				t.Errorf("%d fallbacks: a connection without TLS must not be tried", len(cfg.ConnConfig.Fallbacks))
			}
		})
	}
}

func TestLocallyTheURLDecides(t *testing.T) {
	cfg, err := db.Config("postgres://rud:rud@localhost:5432/rud?sslmode=disable", false)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.ConnConfig.TLSConfig != nil {
		t.Error("TLS set for the local database, which has none")
	}
}

func TestMigrationsCreateTheSchema(t *testing.T) {
	pool := dbtest.Start(t)
	ctx := context.Background()

	if err := pool.Ping(ctx); err != nil {
		t.Fatalf("Ping() = %v", err)
	}

	rows, err := pool.Query(ctx, `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`)
	if err != nil {
		t.Fatal(err)
	}
	var tables []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			t.Fatal(err)
		}
		tables = append(tables, name)
	}
	for _, want := range []string{"users", "reminders", "push_subscriptions", "reminder_events", "nag_messages", "user_seen_messages"} {
		if !slices.Contains(tables, want) {
			t.Errorf("table %q missing; have %v", want, tables)
		}
	}
}

func TestTheAppRoleCanWriteRowsButNotChangeTables(t *testing.T) {
	pool := dbtest.Start(t)
	ctx := context.Background()

	var who string
	if err := pool.QueryRow(ctx, `SELECT current_user`).Scan(&who); err != nil || who != dbtest.AppRole {
		t.Fatalf("current_user = %q, %v; want %s", who, err, dbtest.AppRole)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO users (firebase_uid, email) VALUES ('uid-r', 'r@example.com')`); err != nil {
		t.Fatalf("insert a row: %v", err)
	}
	if _, err := pool.Exec(ctx, `SELECT nextval('reminder_schedule_version_seq')`); err != nil {
		t.Fatalf("take a schedule version: %v", err)
	}
	for _, ddl := range []string{
		`DROP TABLE reminder_events`,
		`ALTER TABLE users ADD COLUMN nope int`,
		`CREATE TABLE nope (id int)`,
		`TRUNCATE users CASCADE`,
	} {
		if _, err := pool.Exec(ctx, ddl); err == nil {
			t.Errorf("%s worked; the app's role must not change tables", ddl)
		}
	}
}

func TestUserDefaultsAndChecks(t *testing.T) {
	pool := dbtest.Start(t)
	ctx := context.Background()

	var interval int
	var tz string
	err := pool.QueryRow(ctx,
		`INSERT INTO users (firebase_uid, email) VALUES ('uid-1', 'a@example.com')
		 RETURNING default_nag_interval_min, timezone`).Scan(&interval, &tz)
	if err != nil {
		t.Fatal(err)
	}
	if interval != 60 || tz != "UTC" {
		t.Errorf("defaults = %d min, %q; want 60 min, UTC (design doc 0, default configuration)", interval, tz)
	}

	// The database itself refuses values outside the allowed range (15 min to 24 h).
	_, err = pool.Exec(ctx,
		`INSERT INTO users (firebase_uid, email, default_nag_interval_min) VALUES ('uid-2', 'b@example.com', 5)`)
	if err == nil {
		t.Error("a 5-minute nag interval was accepted, want the CHECK constraint to refuse it")
	}
}
