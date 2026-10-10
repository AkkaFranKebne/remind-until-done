package httpapi

import (
	"context"
	"log/slog"
	"sync/atomic"
	"time"
)

// dbHealth is the database answer that /healthz reports: the result of one check
// when this instance started (CheckDatabase). /healthz is public, so its callers
// never trigger a ping themselves; otherwise anyone could keep Neon awake and use
// up the free plan's compute.
type dbHealth struct {
	db        Pinger
	log       *slog.Logger
	ok        atomic.Bool
	tries     int
	retryWait time.Duration
}

func newDBHealth(db Pinger, log *slog.Logger) *dbHealth {
	return &dbHealth{db: db, log: log, tries: 3, retryWait: 2 * time.Second}
}

// CheckDatabase pings the database, with a few tries because a sleeping Neon
// database needs a moment to wake up. main calls it once, before the server
// accepts requests, so the deploy smoke test already sees the answer.
func (a *API) CheckDatabase(ctx context.Context) bool {
	h := a.health
	for try := 1; try <= h.tries; try++ {
		// Same limit as the pool's ConnectTimeout.
		pingCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
		err := h.db.Ping(pingCtx)
		cancel()
		if err == nil {
			h.ok.Store(true)
			return true
		}
		h.log.WarnContext(ctx, "database ping failed", "try", try, "err", err)
		if try < h.tries {
			time.Sleep(h.retryWait)
		}
	}
	h.ok.Store(false)
	return false
}
