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
	// An offline phone gets the push if it comes back within this time; after that FCM drops
	// it. The next nag comes anyway and replaces it on the phone (same tag).
	ttl = time.Hour
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
			},
		},
	}
}

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
