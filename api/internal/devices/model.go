// Package devices stores the phone (or browser) that gets a user's pushes (design doc 2.1, 5.7):
// one device per user. Registering a new one replaces the old one; registering the same push
// token again only refreshes when it was last seen. A push token belongs to one browser, so if
// it is still saved for another user (they never signed out on that phone), it moves to the
// user who registered it last (decision 40).
//
// Every query is scoped by the signed-in user's id: another user's device behaves exactly like
// one that doesn't exist (ErrNotFound, HTTP 404). Push tokens are never logged.
package devices

import (
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	// FCM tokens are a few hundred characters; the limit refuses junk and stays under Postgres's
	// 2704-byte index limit for the UNIQUE(fcm_token) (decision 40).
	MaxTokenLength = 2048
	// The browser's User-Agent header, kept for "which phone is this?" (decision 40).
	MaxUserAgentLength = 512
)

// Platforms are the CHECK values in V1__init.sql (and the Platform enum in swagger.json).
var Platforms = []string{"ios", "android", "web"}

type Device struct {
	ID         string
	Platform   string
	UserAgent  *string
	CreatedAt  time.Time
	LastSeenAt time.Time
}

var ErrNotFound = errors.New("device not found") // HTTP 404

// ValidationError is a bad value from the caller (HTTP 400), not a server problem.
type ValidationError struct{ Message string }

func (e ValidationError) Error() string { return e.Message }

// RegisterInput is POST /devices, plus the request's User-Agent header.
type RegisterInput struct {
	FCMToken  string
	Platform  string
	UserAgent string
}

func checkToken(token string) error {
	if token == "" || len(token) > MaxTokenLength || strings.ContainsRune(token, 0) {
		return ValidationError{fmt.Sprintf("fcmToken must be 1 to %d characters", MaxTokenLength)}
	}
	return nil
}

func checkPlatform(p string) error {
	for _, ok := range Platforms {
		if p == ok {
			return nil
		}
	}
	return ValidationError{"platform must be ios, android or web"}
}

// cleanUserAgent: nil when empty; NUL characters removed (Postgres text can't hold them);
// cut to MaxUserAgentLength characters.
func cleanUserAgent(ua string) *string {
	ua = strings.TrimSpace(strings.ReplaceAll(ua, "\x00", ""))
	if ua == "" {
		return nil
	}
	if utf8.RuneCountInString(ua) > MaxUserAgentLength {
		ua = string([]rune(ua)[:MaxUserAgentLength])
	}
	return &ua
}
