package push

import (
	"context"
	"errors"
	"sync"
)

// Sent is one push the Fake was asked to send.
type Sent struct {
	Token   string
	Message Message
}

// Fake is a Sender for tests: it remembers every push and answers Accepted,
// or what Answer(...) set.
type Fake struct {
	mu      sync.Mutex
	sent    []Sent
	outcome Outcome
}

func (f *Fake) Send(_ context.Context, token string, m Message) (Outcome, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.sent = append(f.sent, Sent{Token: token, Message: m})
	if f.outcome == Accepted {
		return Accepted, nil
	}
	return f.outcome, errors.New("fake push: " + f.outcome.String())
}

// Answer makes the next pushes end with this outcome.
func (f *Fake) Answer(o Outcome) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.outcome = o
}

// Sent returns a copy of the pushes so far, oldest first.
func (f *Fake) Sent() []Sent {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]Sent(nil), f.sent...)
}
