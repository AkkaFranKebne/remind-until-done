// Package ratelimit caps how often one key (a user, a reminder) may call the API (design doc 7.2).
//
// A token bucket per key, in memory: a key starts with a full bucket of perMinute requests, each
// request takes one, and the bucket refills evenly over a minute. Short bursts (an app start makes
// a few calls at once) pass; a loop doesn't. Each Cloud Run instance keeps its own buckets, so the
// real limit is approximate, which is fine for a test app: max instances also caps it.
package ratelimit

import (
	"math"
	"sync"
	"time"
)

// Limiter is safe to use from many requests at once.
type Limiter struct {
	perMinute float64
	now       func() time.Time

	mu        sync.Mutex
	buckets   map[string]*bucket
	lastSweep time.Time
}

type bucket struct {
	tokens float64
	at     time.Time // when tokens was last brought up to date
}

// New allows perMinute requests a minute per key (at least 1).
func New(perMinute int) *Limiter {
	return newWithClock(perMinute, time.Now)
}

func newWithClock(perMinute int, now func() time.Time) *Limiter {
	return &Limiter{
		perMinute: float64(max(perMinute, 1)),
		now:       now,
		buckets:   map[string]*bucket{},
		lastSweep: now(),
	}
}

// Allow takes one request from key's bucket. If it's empty, it answers false and how long until
// the next request would pass (for Retry-After).
func (l *Limiter) Allow(key string) (ok bool, retryAfter time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	l.sweep(now)

	b, found := l.buckets[key]
	if !found {
		b = &bucket{tokens: l.perMinute, at: now}
		l.buckets[key] = b
	}
	b.tokens = l.refilled(b, now)
	b.at = now
	if b.tokens >= 1 {
		b.tokens--
		return true, 0
	}
	perToken := time.Minute / time.Duration(l.perMinute)
	return false, time.Duration(math.Ceil((1 - b.tokens) * float64(perToken)))
}

func (l *Limiter) refilled(b *bucket, now time.Time) float64 {
	return min(l.perMinute, b.tokens+now.Sub(b.at).Minutes()*l.perMinute)
}

// sweep forgets buckets that have refilled completely: they would start full anyway. Once a
// minute at most, so memory only holds the keys seen in about the last minute.
func (l *Limiter) sweep(now time.Time) {
	if now.Sub(l.lastSweep) < time.Minute {
		return
	}
	l.lastSweep = now
	for key, b := range l.buckets {
		if l.refilled(b, now) >= l.perMinute {
			delete(l.buckets, key)
		}
	}
}

// size is how many keys are kept (tests).
func (l *Limiter) size() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.buckets)
}
