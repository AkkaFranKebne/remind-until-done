// Package dbtest starts a throwaway Postgres for tests. Only _test.go files
// import it, so testcontainers never ends up in the API binary.
package dbtest

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"slices"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"

	"github.com/AkkaFranKebne/remind-until-done/api/internal/db"
)

// Same image (and digest) as docker-compose.yml.
const postgresImage = "postgres:18.6-alpine@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873"

// Start runs Postgres in Docker, applies the migrations and returns an open pool.
// The container is removed when the test ends.
func Start(t *testing.T) *pgxpool.Pool {
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

	pool, err := db.Open(ctx, url)
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
	_, here, _, _ := runtime.Caller(0)
	files, err := filepath.Glob(filepath.Join(filepath.Dir(here), "..", "..", "db", "migrations", "V*.sql"))
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
