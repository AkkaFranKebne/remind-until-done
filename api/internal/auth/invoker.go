package auth

import (
	"context"
	"errors"
	"fmt"

	"google.golang.org/api/idtoken"
)

// Invoker checks the Google-signed ID token (OIDC) that Cloud Tasks and Cloud
// Scheduler send to /internal/* (design doc 7.1, Appendix D.8). The Cloud Run URL
// is public, because Firebase Hosting must reach it, so this check is the lock.
//
// A token passes only if all of these hold:
//   - Google signed it and it hasn't expired (idtoken checks the signature with
//     Google's public keys);
//   - it was made for our service (audience = the Cloud Run URL);
//   - Google's sign-in service issued it;
//   - it belongs to our invoker account, and Google says that email is verified.
type Invoker struct {
	validator *idtoken.Validator
	audience  string
	email     string
}

// NewInvoker needs no credentials: checking a token only uses Google's public keys.
func NewInvoker(ctx context.Context, audience, email string) (*Invoker, error) {
	// idtoken skips the audience check when it is empty: never allow that.
	if audience == "" || email == "" {
		return nil, errors.New("invoker check needs the service URL (audience) and the invoker email")
	}
	v, err := idtoken.NewValidator(ctx)
	if err != nil {
		return nil, fmt.Errorf("idtoken validator: %w", err)
	}
	return &Invoker{validator: v, audience: audience, email: email}, nil
}

// Verify returns nil only for a valid token from our invoker account.
func (i *Invoker) Verify(ctx context.Context, token string) error {
	p, err := i.validator.Validate(ctx, token, i.audience)
	if err != nil {
		return err
	}
	return checkInvoker(p, i.email)
}

// googleIssuers are the two spellings Google uses for its own ID tokens.
var googleIssuers = map[string]bool{"accounts.google.com": true, "https://accounts.google.com": true}

// checkInvoker checks what idtoken leaves to the caller: who issued the token and for whom.
func checkInvoker(p *idtoken.Payload, email string) error {
	if !googleIssuers[p.Issuer] {
		return fmt.Errorf("token issuer %q is not Google sign-in", p.Issuer)
	}
	got, _ := p.Claims["email"].(string)
	verified, _ := p.Claims["email_verified"].(bool)
	if got != email || !verified {
		return errors.New("token is not from the invoker account")
	}
	return nil
}

// AnyInvoker lets every /internal call through. Only for running locally
// (INTERNAL_AUTH=off), where nothing signs tokens; config refuses it in dev and prod.
type AnyInvoker struct{}

func (AnyInvoker) Verify(context.Context, string) error { return nil }
