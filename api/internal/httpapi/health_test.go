package httpapi

import (
	"context"
	"errors"
	"io"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/AkkaFranKebne/remind-until-done/api/internal/logging"
)

// countingDB counts pings. If gate is set, each ping waits until it's closed.
type countingDB struct {
	calls atomic.Int32
	err   error
	gate  chan struct{}
}

func (c *countingDB) Ping(ctx context.Context) error {
	c.calls.Add(1)
	if c.gate != nil {
		<-c.gate
	}
	return c.err
}

// newTestHealth returns a dbHealth with a clock the test moves by hand.
func newTestHealth(db Pinger) (*dbHealth, *time.Time) {
	now := time.Date(2026, 10, 10, 9, 0, 0, 0, time.UTC)
	h := newDBHealth(db, logging.New(io.Discard))
	h.now = func() time.Time { return now }
	return h, &now
}

func TestHealthReusesAGoodAnswerFor30Seconds(t *testing.T) {
	db := &countingDB{}
	h, now := newTestHealth(db)

	h.isOK(context.Background())
	*now = now.Add(29 * time.Second)
	h.isOK(context.Background())
	if got := db.calls.Load(); got != 1 {
		t.Fatalf("pings within 30s = %d, want 1", got)
	}

	*now = now.Add(2 * time.Second)
	if !h.isOK(context.Background()) {
		t.Error("isOK() = false, want true")
	}
	if got := db.calls.Load(); got != 2 {
		t.Errorf("pings after 31s = %d, want 2", got)
	}
}

func TestHealthRetriesAFailureAfter5Seconds(t *testing.T) {
	db := &countingDB{err: errors.New("asleep")}
	h, now := newTestHealth(db)

	if h.isOK(context.Background()) {
		t.Fatal("isOK() = true, want false while the database fails")
	}
	*now = now.Add(4 * time.Second)
	h.isOK(context.Background())
	if got := db.calls.Load(); got != 1 {
		t.Fatalf("pings within 5s of a failure = %d, want 1", got)
	}

	db.err = nil // the database woke up
	*now = now.Add(2 * time.Second)
	if !h.isOK(context.Background()) {
		t.Error("isOK() = false 6s after the failure, want a new ping that succeeds")
	}
}

func TestHealthCallersShareOnePing(t *testing.T) {
	db := &countingDB{gate: make(chan struct{})}
	h, _ := newTestHealth(db)

	var wg sync.WaitGroup
	for range 20 {
		wg.Go(func() { h.isOK(context.Background()) })
	}
	// Let the first ping finish only once the others are queued behind it.
	for db.calls.Load() == 0 {
		time.Sleep(time.Millisecond)
	}
	time.Sleep(20 * time.Millisecond)
	close(db.gate)
	wg.Wait()

	if got := db.calls.Load(); got != 1 {
		t.Errorf("pings for 20 parallel callers = %d, want 1", got)
	}
}
