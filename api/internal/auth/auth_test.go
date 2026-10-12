package auth

import "testing"

func TestAllowlist(t *testing.T) {
	list := NewAllowlist(" Ewa@Example.com, tester@example.com ,, ")

	cases := []struct {
		name string
		id   Identity
		want bool
	}{
		{"listed", google("tester@example.com", true), true},
		{"case and spaces don't matter", google(" EWA@example.COM", true), true},
		{"not listed", google("stranger@example.com", true), false},
		{"listed but unverified", google("tester@example.com", false), false},
		{"no email", google("", true), false},
		{"listed, but email/password sign-in", Identity{Email: "tester@example.com", EmailVerified: true, SignInProvider: "password"}, false},
		{"listed, but no provider", Identity{Email: "tester@example.com", EmailVerified: true}, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := list.Allows(c.id); got != c.want {
				t.Errorf("Allows(%+v) = %v, want %v", c.id, got, c.want)
			}
		})
	}
	if list.Len() != 2 {
		t.Errorf("Len() = %d, want 2 (empty entries skipped)", list.Len())
	}
}

func google(email string, verified bool) Identity {
	return Identity{Email: email, EmailVerified: verified, SignInProvider: GoogleProvider}
}

func TestEmptyAllowlistLetsNobodyIn(t *testing.T) {
	if NewAllowlist("").Allows(google("a@example.com", true)) {
		t.Error("an empty list let someone in, want nobody (design doc decision 31)")
	}
}
