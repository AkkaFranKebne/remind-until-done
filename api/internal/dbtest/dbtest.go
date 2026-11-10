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

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"

	"github.com/AkkaFranKebne/remind-until-done/api/internal/db"
)

// Same image (and digest) as docker-compose.yml.
const postgresImage = "postgres:18.6-alpine@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873"

// AppRole is the role the API logs in as in dev and prod (V4__app_role.sql): rows only.
const AppRole = "rud_app"

// Start runs Postgres in Docker, applies the migrations (as the owner, like Flyway) and returns
// an open pool that works as AppRole, like the API in dev and prod: every database test then
// proves the API needs no more than read and write on rows. The container is removed when the
// test ends.
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

	owner, err := db.Open(ctx, url, false) // the test container has no TLS
	if err != nil {
		t.Fatal(err)
	}
	applyMigrations(t, owner)
	owner.Close()

	cfg, err := db.Config(url, false)
	if err != nil {
		t.Fatal(err)
	}
	// The test login is the owner; each connection switches to the app's role at once.
	cfg.AfterConnect = func(ctx context.Context, c *pgx.Conn) error {
		_, err := c.Exec(ctx, "SET ROLE "+AppRole)
		return err
	}
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	return pool
}

// AsOwner runs one statement as the owner, for a test that breaks the schema on purpose (renames
// a table to make a query fail). The app's role can't do that, which is the point of it.
func AsOwner(t *testing.T, pool *pgxpool.Pool, sql string) {
	t.Helper()
	ctx := context.Background()
	c, err := pool.Acquire(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer c.Release()
	for _, stmt := range []string{"RESET ROLE", sql, "SET ROLE " + AppRole} {
		if _, err := c.Exec(ctx, stmt); err != nil {
			t.Fatalf("%s: %v", stmt, err)
		}
	}
}

// applyMigrations runs api/db/migrations/V*.sql in order and then R__*.sql, like Flyway does.
// (CI also runs the real Flyway against these files.)
func applyMigrations(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	_, here, _, _ := runtime.Caller(0)
	files, err := filepath.Glob(filepath.Join(filepath.Dir(here), "..", "..", "db", "migrations", "V*.sql"))
	if err != nil || len(files) == 0 {
		t.Fatalf("no migrations found: %v", err)
	}
	slices.Sort(files) // fine while there are fewer than 10; Flyway sorts by version number
	// Repeatable migrations run after all the versioned ones.
	repeatable, err := filepath.Glob(filepath.Join(filepath.Dir(here), "..", "..", "db", "migrations", "R__*.sql"))
	if err != nil {
		t.Fatal(err)
	}
	slices.Sort(repeatable)
	for _, f := range append(files, repeatable...) {
		sql, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := pool.Exec(context.Background(), string(sql)); err != nil {
			t.Fatalf("%s: %v", filepath.Base(f), err)
		}
	}
}
