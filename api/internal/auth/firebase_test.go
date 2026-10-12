package auth

import (
	"context"
	"crypto"
	"crypto/hmac"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

// These tests use the REAL Firebase checker (not a fake), so they need internet:
// it downloads Google's public keys to check signatures. CI has internet.
//
// The fake checker in httpapi tests our own logic (401/403, invite list). This file
// makes sure the real checker refuses tokens that only look genuine, so a library
// upgrade or a setup mistake can't quietly let strangers in.

const testProject = "rud-dev-4f7k2"

func b64(v any) string {
	j, _ := json.Marshal(v)
	return base64.RawURLEncoding.EncodeToString(j)
}

// claims are what a real token for testProject would contain: right audience and
// issuer, not expired, a verified Google email.
func claims() map[string]any {
	now := time.Now().Unix()
	return map[string]any{
		"aud": testProject, "iss": "https://securetoken.google.com/" + testProject,
		"sub": "attacker", "iat": now, "exp": now + 600, "auth_time": now,
		"email": "ewa@example.com", "email_verified": true,
		"firebase": map[string]any{"sign_in_provider": "google.com"},
	}
}

// signed builds a JWT signed with our own RSA key, not Google's.
func signed(t *testing.T, header, payload map[string]any) string {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	unsigned := b64(header) + "." + b64(payload)
	sum := sha256.Sum256([]byte(unsigned))
	sig, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, sum[:])
	if err != nil {
		t.Fatal(err)
	}
	return unsigned + "." + base64.RawURLEncoding.EncodeToString(sig)
}

func TestRealCheckerRefusesForgedTokens(t *testing.T) {
	fb, err := NewFirebase(context.Background(), testProject)
	if err != nil {
		t.Fatal(err)
	}

	// "Algorithm confusion": a token signed with a shared-secret algorithm (HS256)
	// instead of Google's RSA keys. Libraries that trust the token's own "alg" fall for it.
	hsUnsigned := b64(map[string]any{"alg": "HS256", "typ": "JWT"}) + "." + b64(claims())
	mac := hmac.New(sha256.New, []byte("guessable-secret"))
	mac.Write([]byte(hsUnsigned))

	forged := map[string]string{
		"signed with our own key":     signed(t, map[string]any{"alg": "RS256", "typ": "JWT", "kid": "made-up"}, claims()),
		"no signature (alg none)":     b64(map[string]any{"alg": "none", "typ": "JWT"}) + "." + b64(claims()) + ".",
		"shared-secret algorithm":     hsUnsigned + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil)),
		"random bytes as a signature": b64(map[string]any{"alg": "RS256", "typ": "JWT", "kid": "made-up"}) + "." + b64(claims()) + ".c2lnbmF0dXJl",
		"not a token at all":          "hello",
		"empty":                       "",
	}
	for name, token := range forged {
		t.Run(name, func(t *testing.T) {
			if id, err := fb.Verify(context.Background(), token); err == nil {
				t.Fatalf("a forged token was ACCEPTED as %+v: sign-in is broken", id)
			}
		})
	}

	// The well-formed forgery must be refused at the signature check itself, i.e.
	// after downloading Google's keys, not for some earlier reason (like no network).
	_, err = fb.Verify(context.Background(), forged["signed with our own key"])
	if err == nil || !strings.Contains(err.Error(), "signature") {
		t.Errorf("own-key forgery refused with %v; want a signature error (is the network up?)", err)
	}
}

func TestRealCheckerRefusesTokensForAnotherProject(t *testing.T) {
	fb, err := NewFirebase(context.Background(), "rud-prod-4f7k2")
	if err != nil {
		t.Fatal(err)
	}
	// Made for the dev project. The library checks the project ("aud", the audience)
	// before the signature, so the error must be about "aud": that proves the project
	// check itself refused it, not only the (missing) Google signature.
	token := signed(t, map[string]any{"alg": "RS256", "typ": "JWT", "kid": "made-up"}, claims())
	_, err = fb.Verify(context.Background(), token)
	if err == nil {
		t.Fatal("prod accepted a token made for the dev project")
	}
	if !strings.Contains(err.Error(), "aud") {
		t.Errorf("refused with %q; want the audience (project) check to refuse it", err)
	}
}
