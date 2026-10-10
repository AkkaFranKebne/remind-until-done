// Package db sets up the Postgres connection pool (pgx).
//
// A pool keeps a few connections open and lends one to each query, instead of
// opening a new connection per request (slow, and Neon limits how many it accepts).
package db

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Open creates the pool. It doesn't connect yet: the first query does. So the API
// starts even while the database is asleep or unreachable, and /healthz reports it.
func Open(ctx context.Context, url string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		// Not wrapped: the parse error can quote the URL, which contains the password.
		return nil, errors.New("DATABASE_URL is not a valid Postgres URL")
	}
	cfg.MaxConns = 4                                 // per instance; Cloud Run runs at most max_instances (infra/variables.tf)
	cfg.MaxConnIdleTime = time.Minute                // close connections nobody has used for a minute
	cfg.ConnConfig.ConnectTimeout = 10 * time.Second // a sleeping Neon database needs a moment to wake up
	return pgxpool.NewWithConfig(ctx, cfg)
}
