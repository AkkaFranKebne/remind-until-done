package ratelimit

import (
	"sync"
	"testing"
	"time"
)

// clock is a time that only moves when the test says so.
type clock struct{ t time.Time }

func (c *clock) now() time.Time      { return c.t }
func (c *clock) add(d time.Duration) { c.t = c.t.Add(d) }
func newClock() *clock               { return &clock{t: time.Date(2026, 11, 10, 12, 0, 0, 0, time.UTC)} }
func allowN(l *Limiter, key string, n int) (passed int) {
	for range n {
		if ok, _ := l.Allow(key); ok {
			passed++
		}
	}
	return passed
}

func TestABurstUpToTheLimitPassesThenItStops(t *testing.T) {
	c := newClock()
	l := newWithClock(60, c.now)

	if got := allowN(l, "u1", 60); got != 60 {
		t.Fatalf("passed %d of the first 60, want all", got)
	}
	ok, retry := l.Allow("u1")
	if ok {
		t.Fatal("the 61st request in the same moment passed")
	}
	if retry != time.Second {
		t.Fatalf("retry after %v, want 1s (one request a second at 60 a minute)", retry)
	}
}

func TestItRefillsEvenlyOverAMinute(t *testing.T) {
	c := newClock()
	l := newWithClock(60, c.now)
	allowN(l, "u1", 60)

	c.add(10 * time.Second)
	if got := allowN(l, "u1", 20); got != 10 {
		t.Fatalf("after 10 s, %d passed, want 10", got)
	}
	c.add(time.Hour)
	if got := allowN(l, "u1", 100); got != 60 {
		t.Fatalf("after a long pause, %d passed, want a full bucket of 60 and no more", got)
	}
}

func TestKeysDontShareABucket(t *testing.T) {
	c := newClock()
	l := newWithClock(2, c.now)
	allowN(l, "u1", 2)

	if ok, _ := l.Allow("u2"); !ok {
		t.Fatal("another key was limited by u1's requests")
	}
}

func TestIdleKeysAreForgotten(t *testing.T) {
	c := newClock()
	l := newWithClock(60, c.now)
	for _, key := range []string{"a", "b", "c"} {
		l.Allow(key)
	}
	c.add(2 * time.Minute)
	l.Allow("d")

	if got := l.size(); got != 1 {
		t.Fatalf("kept %d keys, want only the one seen in the last minute", got)
	}
}

func TestSafeFromManyRequestsAtOnce(t *testing.T) {
	l := New(100)
	var wg sync.WaitGroup
	var mu sync.Mutex
	passed := 0
	for range 200 {
		wg.Go(func() {
			if ok, _ := l.Allow("u1"); ok {
				mu.Lock()
				passed++
				mu.Unlock()
			}
		})
	}
	wg.Wait()
	// About 100: a little more if the test ran slowly and some refilled.
	if passed < 100 || passed > 110 {
		t.Fatalf("%d of 200 passed, want about 100", passed)
	}
}
