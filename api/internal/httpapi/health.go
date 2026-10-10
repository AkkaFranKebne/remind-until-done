package httpapi

import (
	"context"
	"log/slog"
	"sync"
	"time"
)

// dbHealth remembers the last database ping, because /healthz is public: without
// it, anyone calling it in a loop would keep Neon awake (using up the free plan's
// compute) and tie up pool connections.
//
//   - A good answer is reused for okTTL, a failure only for failTTL, so a database
//     that just woke up is seen quickly.
//   - Callers arriving during a ping wait for that ping instead of starting their
//     own, so /healthz uses at most one connection at a time.
type dbHealth struct {
	db      Pinger
	log     *slog.Logger
	okTTL   time.Duration
	failTTL time.Duration
	now     func() time.Time

	mu      sync.Mutex
	checked time.Time
	ok      bool
}

func newDBHealth(db Pinger, log *slog.Logger) *dbHealth {
	return &dbHealth{db: db, log: log, okTTL: 30 * time.Second, failTTL: 5 * time.Second, now: time.Now}
}

func (h *dbHealth) isOK(ctx context.Context) bool {
	h.mu.Lock()
	defer h.mu.Unlock()

	ttl := h.failTTL
	if h.ok {
		ttl = h.okTTL
	}
	if !h.checked.IsZero() && h.now().Sub(h.checked) < ttl {
		return h.ok
	}

	// Not tied to this caller's request: if they hang up, the answer still counts
	// for everyone waiting.
	pingCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	err := h.db.Ping(pingCtx)
	if err != nil {
		h.log.WarnContext(ctx, "database ping failed", "err", err)
	}
	h.ok, h.checked = err == nil, h.now()
	return h.ok
}
