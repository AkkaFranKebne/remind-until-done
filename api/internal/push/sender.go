// Package push sends one nag to one phone through Firebase Cloud Messaging (design doc 3.3, D.3).
//
// Only this package imports the FCM SDK. Everything else uses the Sender interface, so
// tests can pass a Fake and local runs a Log.
package push

import (
	"context"
	"strconv"
	"time"
)

// Message is one push. The service worker (web/src/sw/notification.ts) shows it.
type Message struct {
	ReminderID  string
	Title       string // the reminder's title
	Body        string // the nag line
	URL         string // opened on tap: /r/{id}
	Attempt     int    // this push's number, 1 to MaxAttempts
	MaxAttempts int
	SentAt      time.Time // the notification shows this time, even if the phone was off (decision 54)
	DoneToken   string    // for the notification's Done button; never log it
}

// data is what the service worker reads from the push. FCM data values must be strings.
func (m Message) data() map[string]string {
	return map[string]string{
		"reminderId":  m.ReminderID,
		"title":       m.Title,
		"body":        m.Body,
		"url":         m.URL,
		"attempt":     strconv.Itoa(m.Attempt),
		"maxAttempts": strconv.Itoa(m.MaxAttempts),
		"sentAt":      m.SentAt.UTC().Format(time.RFC3339),
		"doneToken":   m.DoneToken,
	}
}

// Outcome tells the fire handler what to do next.
type Outcome int

const (
	// Accepted: FCM took the push. Record it and book the next nag.
	Accepted Outcome = iota
	// TokenGone: this phone will never get pushes with this token again (app removed,
	// notifications reset, token from another Firebase project). Delete the device and stop.
	TokenGone
	// TryLater: anything else (FCM down, a timeout, our own mistake). Cloud Tasks retries.
	TryLater
)

func (o Outcome) String() string {
	switch o {
	case Accepted:
		return "accepted"
	case TokenGone:
		return "token_gone"
	default:
		return "try_later"
	}
}

type Sender interface {
	// Send pushes m to the phone with this token. The error explains a TokenGone or TryLater.
	// The token is a secret of the user's phone: implementations never log it.
	Send(ctx context.Context, token string, m Message) (Outcome, error)
}
