package auth

import "testing"

func TestAllowlist(t *testing.T) {
	list := NewAllowlist(" Ewa@Example.com, tester@example.com ,, ")

	cases := []struct {
		name string
		id   Identity
		want bool
	}{
		{"listed", Identity{Email: "tester@example.com", EmailVerified: true}, true},
		{"case and spaces don't matter", Identity{Email: " EWA@example.COM", EmailVerified: true}, true},
		{"not listed", Identity{Email: "stranger@example.com", EmailVerified: true}, false},
		{"listed but unverified", Identity{Email: "tester@example.com", EmailVerified: false}, false},
		{"no email", Identity{EmailVerified: true}, false},
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

func TestEmptyAllowlistLetsNobodyIn(t *testing.T) {
	if NewAllowlist("").Allows(Identity{Email: "a@example.com", EmailVerified: true}) {
		t.Error("an empty list let someone in, want nobody (design doc decision 31)")
	}
}
