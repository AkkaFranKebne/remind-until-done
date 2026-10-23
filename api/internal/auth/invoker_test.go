package auth

import (
	"context"
	"testing"

	"google.golang.org/api/idtoken"
)

const invokerEmail = "rud-invoker-dev@rud-dev-4f7k2.iam.gserviceaccount.com"

func TestCheckInvoker(t *testing.T) {
	ok := func() *idtoken.Payload {
		return &idtoken.Payload{
			Issuer: "https://accounts.google.com",
			Claims: map[string]any{"email": invokerEmail, "email_verified": true},
		}
	}
	tests := []struct {
		name   string
		change func(p *idtoken.Payload)
		wantOK bool
	}{
		{"our invoker account", func(*idtoken.Payload) {}, true},
		{"issuer without https", func(p *idtoken.Payload) { p.Issuer = "accounts.google.com" }, true},
		{"another account", func(p *idtoken.Payload) { p.Claims["email"] = "someone@example.com" }, false},
		{"no email", func(p *idtoken.Payload) { delete(p.Claims, "email") }, false},
		{"email not verified", func(p *idtoken.Payload) { p.Claims["email_verified"] = false }, false},
		// IAP signs ES256 tokens that idtoken also accepts; they must not pass.
		{"another issuer", func(p *idtoken.Payload) { p.Issuer = "https://cloud.google.com/iap" }, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			p := ok()
			tt.change(p)
			if err := checkInvoker(p, invokerEmail); (err == nil) != tt.wantOK {
				t.Errorf("checkInvoker() error = %v, want ok = %v", err, tt.wantOK)
			}
		})
	}
}

func TestNewInvokerNeedsAudienceAndEmail(t *testing.T) {
	ctx := context.Background()
	if _, err := NewInvoker(ctx, "", invokerEmail); err == nil {
		t.Error("NewInvoker() with no audience: error = nil, want an error (idtoken would skip the check)")
	}
	if _, err := NewInvoker(ctx, "https://rud-api.run.app", ""); err == nil {
		t.Error("NewInvoker() with no email: error = nil, want an error")
	}
}

func TestInvokerRefusesAGarbageToken(t *testing.T) {
	inv, err := NewInvoker(context.Background(), "https://rud-api.run.app", invokerEmail)
	if err != nil {
		t.Fatal(err)
	}
	// Fails while parsing, before any network call for Google's keys.
	if err := inv.Verify(context.Background(), "not-a-jwt"); err == nil {
		t.Error("Verify() error = nil, want an error")
	}
}
