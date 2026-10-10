package db

import (
	"context"
	"os"
	"path/filepath"
	"slices"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
)

// Same image as docker-compose.yml.
const postgresImage = "postgres:17.11-alpine"

// startDatabase starts a throwaway Postgres in Docker, applies the migrations and
// returns an open pool. The container is removed when the test ends.
func startDatabase(t *testing.T) *pgxpool.Pool {
	t.Helper()
	ctx := context.Background()

	ctr, err := postgres.Run(ctx, postgresImage,
		postgres.WithDatabase("rud"),
		postgres.BasicWaitStrategies(),
	)
	testcontainers.CleanupContainer(t, ctr)
	if err != nil {
		t.Fatalf("start Postgres (is Docker running?): %v", err)
	}
	url, err := ctr.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}

	pool, err := Open(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	applyMigrations(t, pool)
	return pool
}

// applyMigrations runs api/db/migrations/V*.sql in order, like Flyway does.
// (CI also runs the real Flyway against these files.)
func applyMigrations(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	files, err := filepath.Glob("../../db/migrations/V*.sql")
	if err != nil || len(files) == 0 {
		t.Fatalf("no migrations found: %v", err)
	}
	slices.Sort(files) // fine while there are fewer than 10; Flyway sorts by version number
	for _, f := range files {
		sql, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := pool.Exec(context.Background(), string(sql)); err != nil {
			t.Fatalf("%s: %v", filepath.Base(f), err)
		}
	}
}

func TestOpenRejectsBadURLWithoutLeakingIt(t *testing.T) {
	_, err := Open(context.Background(), "postgres://user:s3cret@host:notaport/rud")
	if err == nil {
		t.Fatal("Open() error = nil, want an error for a bad URL")
	}
	if got := err.Error(); got != "DATABASE_URL is not a valid Postgres URL" {
		t.Errorf("Open() error = %q, must not quote the URL", got)
	}
}

func TestMigrationsCreateTheSchema(t *testing.T) {
	pool := startDatabase(t)
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

func TestUserDefaultsAndChecks(t *testing.T) {
	pool := startDatabase(t)
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
