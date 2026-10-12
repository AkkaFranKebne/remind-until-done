// Package auth answers "who is calling, and are they invited?".
//
// The web app signs in with Google through Firebase and sends the Firebase ID
// token (a signed JWT, valid for an hour) as "Authorization: Bearer <token>".
// Only this package imports the Firebase SDK; httpapi uses the Identity it returns.
package auth

import (
	"context"
	"fmt"
	"strings"

	firebase "firebase.google.com/go/v4"
	fbauth "firebase.google.com/go/v4/auth"
	"google.golang.org/api/option"
)

// Identity is what a valid token says about the caller.
type Identity struct {
	UID            string // Firebase user id, stable for this Google account
	Email          string
	EmailVerified  bool
	SignInProvider string // "google.com" for Google sign-in
}

// GoogleProvider is the only sign-in method in v1 (design doc section 0).
const GoogleProvider = "google.com"

// Firebase checks ID tokens issued for one Firebase project.
type Firebase struct {
	client *fbauth.Client
}

// NewFirebase needs no credentials: checking a token only uses Google's public
// keys (downloaded and cached by the SDK) and the project id.
func NewFirebase(ctx context.Context, projectID string) (*Firebase, error) {
	app, err := firebase.NewApp(ctx, &firebase.Config{ProjectID: projectID}, option.WithoutAuthentication())
	if err != nil {
		return nil, fmt.Errorf("firebase app: %w", err)
	}
	client, err := app.Auth(ctx)
	if err != nil {
		return nil, fmt.Errorf("firebase auth: %w", err)
	}
	return &Firebase{client: client}, nil
}

// Verify checks the signature, expiry, issuer and audience (our project).
func (f *Firebase) Verify(ctx context.Context, idToken string) (Identity, error) {
	tok, err := f.client.VerifyIDToken(ctx, idToken)
	if err != nil {
		return Identity{}, err
	}
	email, _ := tok.Claims["email"].(string)
	verified, _ := tok.Claims["email_verified"].(bool)
	return Identity{UID: tok.UID, Email: email, EmailVerified: verified, SignInProvider: tok.Firebase.SignInProvider}, nil
}

// Allowlist is the invite list (the ALLOWED_EMAILS secret, comma-separated).
// The same rule everywhere: only listed emails get in, an empty list lets nobody in.
type Allowlist struct {
	emails map[string]bool
}

func NewAllowlist(csv string) Allowlist {
	emails := map[string]bool{}
	for _, e := range strings.Split(csv, ",") {
		if e = normalize(e); e != "" {
			emails[e] = true
		}
	}
	return Allowlist{emails: emails}
}

// Allows is true only for a Google sign-in with a verified email on the list.
//   - Unverified emails are refused: otherwise an account that merely claims a
//     tester's address could get in.
//   - Other sign-in methods are refused even if someone switches them on in the
//     Firebase console later (that setting isn't in Terraform, so no review sees it).
func (l Allowlist) Allows(id Identity) bool {
	return id.SignInProvider == GoogleProvider && id.EmailVerified && l.emails[normalize(id.Email)]
}

func (l Allowlist) Len() int { return len(l.emails) }

func normalize(email string) string { return strings.ToLower(strings.TrimSpace(email)) }
