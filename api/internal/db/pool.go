// Package db sets up the Postgres connection pool (pgx).
//
// A pool keeps a few connections open and lends one to each query, instead of
// opening a new connection per request (slow, and Neon limits how many it accepts).
package db

import (
	"context"
	"crypto/tls"
	"errors"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Open creates the pool. It doesn't connect yet: the first query does. So the API
// starts even while the database is asleep or unreachable, and /healthz reports it.
// verifyServer: see Config.
func Open(ctx context.Context, url string, verifyServer bool) (*pgxpool.Pool, error) {
	cfg, err := Config(url, verifyServer)
	if err != nil {
		return nil, err
	}
	return pgxpool.NewWithConfig(ctx, cfg)
}

// Config reads the URL into the pool's settings.
//
// verifyServer (dev and prod): always TLS, and the server's certificate must be valid for its
// host, checked against the system's trusted roots (Neon's is from Let's Encrypt). Neon's URL
// says sslmode=require, which encrypts but would accept any certificate, so someone in between
// could pretend to be the database. Set here, not in the URL, so a URL that says less can't
// switch the check off (decision 86).
func Config(url string, verifyServer bool) (*pgxpool.Config, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		// Not wrapped: the parse error can quote the URL, which contains the password.
		return nil, errors.New("DATABASE_URL is not a valid Postgres URL")
	}
	cfg.MaxConns = 4                                 // per instance; Cloud Run runs at most max_instances (infra/variables.tf)
	cfg.MaxConnIdleTime = time.Minute                // close connections nobody has used for a minute
	cfg.ConnConfig.ConnectTimeout = 10 * time.Second // a sleeping Neon database needs a moment to wake up
	if verifyServer {
		cfg.ConnConfig.TLSConfig = &tls.Config{ServerName: cfg.ConnConfig.Host, MinVersion: tls.VersionTLS12}
		cfg.ConnConfig.Fallbacks = nil // sslmode=prefer or allow would retry without TLS
	}
	return cfg, nil
}
