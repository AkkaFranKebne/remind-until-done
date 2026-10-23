package push

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/messaging"
	"google.golang.org/api/option"
)

const (
	// A push waits at most this long for FCM, then counts as TryLater (design doc 3.3).
	sendTimeout = 5 * time.Second
	// An offline phone gets the push if it comes back within this time: the longest nag
	// interval, so a phone that was off for up to a day still hears about the reminder.
	// The Topic header (below) makes sure it gets only the newest one.
	ttl = 24 * time.Hour
)

// FCM sends data-only web pushes for one Firebase project.
type FCM struct {
	client *messaging.Client
}

// NewFCM logs in as the Cloud Run service account (on a laptop: gcloud's application default
// login). Tests pass option.WithEndpoint to talk to a fake FCM server.
func NewFCM(ctx context.Context, projectID string, opts ...option.ClientOption) (*FCM, error) {
	app, err := firebase.NewApp(ctx, &firebase.Config{ProjectID: projectID}, opts...)
	if err != nil {
		return nil, fmt.Errorf("firebase app: %w", err)
	}
	client, err := app.Messaging(ctx)
	if err != nil {
		return nil, fmt.Errorf("firebase messaging: %w", err)
	}
	return &FCM{client: client}, nil
}

func (f *FCM) Send(ctx context.Context, token string, m Message) (Outcome, error) {
	ctx, cancel := context.WithTimeout(ctx, sendTimeout)
	defer cancel()
	_, err := f.client.Send(ctx, message(token, m))
	return outcome(err), shorten(err)
}

// maxErrorText: the SDK's error text is the answer's body, of any size (a proxy's HTML page,
// say). The caller logs it on every retry, so it's cut short; the outcome is decided first.
const maxErrorText = 200

func shorten(err error) error {
	if err == nil || len(err.Error()) <= maxErrorText {
		return err
	}
	return errors.New(strings.ToValidUTF8(err.Error()[:maxErrorText], "") + "…") // no half letter at the cut
}

// message is data-only: no notification block, so the service worker always builds the
// notification itself (design doc 5.8; iOS requires one for every push).
func message(token string, m Message) *messaging.Message {
	return &messaging.Message{
		Token: token,
		Data:  m.data(),
		Webpush: &messaging.WebpushConfig{
			Headers: map[string]string{
				"Urgency": "high", // deliver now, even on a phone saving battery
				"TTL":     strconv.Itoa(int(ttl.Seconds())),
				// While the phone is off, a new push with the same topic replaces the waiting one,
				// so a phone coming back gets one notification: the latest nag.
				"Topic": topic(m.ReminderID),
			},
		},
	}
}

// topic is the reminder's id without dashes: web push allows at most 32 characters
// from the URL-safe base64 alphabet, and a UUID is 32 hex digits.
func topic(reminderID string) string { return strings.ReplaceAll(reminderID, "-", "") }

func outcome(err error) Outcome {
	switch {
	case err == nil:
		return Accepted
	// UNREGISTERED: the token is dead. SENDER_ID_MISMATCH: it belongs to another Firebase
	// project (a dev token in prod), so it can never work here.
	case messaging.IsUnregistered(err), messaging.IsSenderIDMismatch(err):
		return TokenGone
	default:
		return TryLater
	}
}
