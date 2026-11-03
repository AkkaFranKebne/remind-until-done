// Package actiontoken signs and checks the short-lived tokens behind a notification's Done button
// (design doc 2.2, D.9). The service worker has no Firebase login, so the token is the login. It
// can do one thing only: mark one reminder done.
//
// A token is base64url(payload) + "." + base64url(HMAC-SHA256(key, payload)). The payload isn't
// secret, but nobody can change it or make a new one without the key.
package actiontoken

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
)

// Action is what a token allows.
type Action string

const Done Action = "done"

// maxLength is far above any token we make. Longer input is refused before any work is done on it.
const maxLength = 512

// ErrInvalid: changed, expired, or not one of ours. It never says which, and never quotes the token.
var ErrInvalid = errors.New("action token not valid")

// Claims is what a valid token says.
type Claims struct {
	ReminderID string
	Version    int // the reminder's schedule_version: an edit makes older tokens stop working
	Action     Action
}

type payload struct {
	ReminderID string `json:"r"`
	Action     Action `json:"a"`
	Version    int    `json:"v"`
	Expires    int64  `json:"exp"`
}

// Signer holds the key. Never log it, or a token.
type Signer struct{ key []byte }

func NewSigner(key string) Signer { return Signer{key: []byte(key)} }

// Sign makes a token that works for ttl from now.
func (s Signer) Sign(reminderID string, version int, a Action, ttl time.Duration) string {
	raw, _ := json.Marshal(payload{ReminderID: reminderID, Action: a, Version: version, Expires: time.Now().Add(ttl).Unix()}) // strings and numbers: can't fail
	enc := base64.RawURLEncoding
	return enc.EncodeToString(raw) + "." + enc.EncodeToString(s.mac(raw))
}

// Verify checks the signature first, so nothing else in the token is read until we know it's ours.
func (s Signer) Verify(token string) (Claims, error) {
	if len(token) > maxLength {
		return Claims{}, ErrInvalid
	}
	body, sig, ok := strings.Cut(token, ".")
	if !ok {
		return Claims{}, ErrInvalid
	}
	enc := base64.RawURLEncoding
	raw, err := enc.DecodeString(body)
	if err != nil {
		return Claims{}, ErrInvalid
	}
	got, err := enc.DecodeString(sig)
	if err != nil || !hmac.Equal(got, s.mac(raw)) { // hmac.Equal takes the same time wherever they differ
		return Claims{}, ErrInvalid
	}
	var p payload
	if err := json.Unmarshal(raw, &p); err != nil {
		return Claims{}, ErrInvalid
	}
	if time.Now().Unix() >= p.Expires || p.Action != Done {
		return Claims{}, ErrInvalid
	}
	if _, err := uuid.Parse(p.ReminderID); err != nil {
		return Claims{}, ErrInvalid
	}
	return Claims{ReminderID: p.ReminderID, Version: p.Version, Action: p.Action}, nil
}

func (s Signer) mac(raw []byte) []byte {
	h := hmac.New(sha256.New, s.key)
	h.Write(raw)
	return h.Sum(nil)
}
