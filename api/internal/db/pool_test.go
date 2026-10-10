package db_test

import (
	"context"
	"slices"
	"testing"

	"github.com/AkkaFranKebne/remind-until-done/api/internal/db"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/dbtest"
)

func TestOpenRejectsBadURLWithoutLeakingIt(t *testing.T) {
	_, err := db.Open(context.Background(), "postgres://user:s3cret@host:notaport/rud")
	if err == nil {
		t.Fatal("Open() error = nil, want an error for a bad URL")
	}
	if got := err.Error(); got != "DATABASE_URL is not a valid Postgres URL" {
		t.Errorf("Open() error = %q, must not quote the URL", got)
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
