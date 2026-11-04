package actiontoken_test

import (
	"encoding/base64"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/AkkaFranKebne/remind-until-done/api/internal/actiontoken"
)

const reminderID = "7f9c2a54-1111-4222-8333-444455556666"

var signer = actiontoken.NewSigner("a test key that is long enough for this")

func TestAValidTokenSaysWhatWasSigned(t *testing.T) {
	got, err := signer.Verify(signer.Sign(reminderID, 7, actiontoken.Done, time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	want := actiontoken.Claims{ReminderID: reminderID, Version: 7, Action: actiontoken.Done}
	if got != want {
		t.Errorf("got %+v, want %+v", got, want)
	}
}

func TestBadTokensAreRefused(t *testing.T) {
	good := signer.Sign(reminderID, 7, actiontoken.Done, time.Hour)
	body, sig, _ := strings.Cut(good, ".")
	other := actiontoken.NewSigner("another key that is long enough for this")
	enc := base64.RawURLEncoding
	forged := enc.EncodeToString([]byte(`{"r":"` + reminderID + `","a":"done","v":8,"exp":9999999999}`))

	cases := map[string]string{
		"empty":                 "",
		"no dot":                body + sig,
		"not base64":            "!!!." + sig,
		"signature not base64":  body + ".!!!",
		"no signature":          body + ".",
		"no body":               "." + sig,
		"changed payload":       forged + "." + sig,
		"signed with other key": other.Sign(reminderID, 7, actiontoken.Done, time.Hour),
		"expired":               signer.Sign(reminderID, 7, actiontoken.Done, -time.Second),
		"another action":        signer.Sign(reminderID, 7, actiontoken.Action("delete"), time.Hour),
		"not a reminder id":     signer.Sign("x", 7, actiontoken.Done, time.Hour),
		"too long":              good + strings.Repeat("a", 512),
	}
	for name, token := range cases {
		if _, err := signer.Verify(token); !errors.Is(err, actiontoken.ErrInvalid) {
			t.Errorf("%s: %v, want ErrInvalid", name, err)
		}
	}
}

func TestErrorsNeverQuoteTheToken(t *testing.T) {
	token := signer.Sign(reminderID, 7, actiontoken.Done, -time.Second)
	if _, err := signer.Verify(token); err == nil || strings.Contains(err.Error(), token) {
		t.Errorf("error %v quotes the token", err)
	}
}
