package httpapi

import (
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/AkkaFranKebne/remind-until-done/api/internal/auth"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/logging"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/users"
)

const invitedHeader = "Bearer " + invitedToken

func TestDeleteMeRemovesTheRowsThenTheFirebaseUser(t *testing.T) {
	api := newMeAPI()
	api.call(t, "GET", "/api/v1/me", invitedHeader, "")

	status, _ := api.call(t, "DELETE", "/api/v1/me", invitedHeader, "")

	if status != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", status)
	}
	if _, ok := api.users.byUID["u1"]; ok {
		t.Error("the user's row should be gone")
	}
	if !api.accounts.gone["u1"] {
		t.Error("the Firebase user should be gone")
	}
}

func TestDeleteMeNeedsSignIn(t *testing.T) {
	api := newMeAPI()
	if status, _ := api.call(t, "DELETE", "/api/v1/me", "", ""); status != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", status)
	}
}

// Decision 76: the token of a deleted account still works for up to an hour.
func TestALateRequestDoesNotBringADeletedAccountBack(t *testing.T) {
	api := newMeAPI()
	api.call(t, "GET", "/api/v1/me", invitedHeader, "")
	api.call(t, "DELETE", "/api/v1/me", invitedHeader, "")
	creates := api.users.creates

	status, _ := api.call(t, "GET", "/api/v1/me", invitedHeader, "")

	if status != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", status)
	}
	if api.users.creates != creates {
		t.Error("a deleted account got a new row")
	}
}

func TestAFailedFirebaseDeleteIsFinishedByTryingAgain(t *testing.T) {
	api := newMeAPI()
	api.call(t, "GET", "/api/v1/me", invitedHeader, "")
	api.accounts.deleteErr = errors.New("firebase is down")

	status, body := api.call(t, "DELETE", "/api/v1/me", invitedHeader, "")
	if status != http.StatusServiceUnavailable || !strings.Contains(body["error"].(map[string]any)["code"].(string), "unavailable") {
		t.Fatalf("first try: %d %v, want 503 unavailable", status, body)
	}
	if strings.Contains(api.logs.String(), "ewa@example.com") {
		t.Errorf("the log has an email: %s", api.logs)
	}
	if _, ok := api.users.byUID["u1"]; !ok {
		t.Error("a failed delete should lose nothing")
	}

	api.accounts.deleteErr = nil
	if status, _ := api.call(t, "DELETE", "/api/v1/me", invitedHeader, ""); status != http.StatusNoContent {
		t.Fatalf("second try: %d, want 204", status)
	}
	if _, ok := api.users.byUID["u1"]; ok || !api.accounts.gone["u1"] {
		t.Error("the second try should finish the job")
	}
}

func TestAFailedRowDeleteLeavesTheFirebaseUser(t *testing.T) {
	api := newMeAPI()
	api.call(t, "GET", "/api/v1/me", invitedHeader, "")
	api.users.deleteErr = errors.New("database is down")

	if status, _ := api.call(t, "DELETE", "/api/v1/me", invitedHeader, ""); status != http.StatusServiceUnavailable {
		t.Errorf("status = %d, want 503", status)
	}
	if api.accounts.gone["u1"] {
		t.Error("the Firebase user should stay, or nobody could sign in to try again")
	}
}

func TestOnlyANewUserIsCheckedWithFirebase(t *testing.T) {
	api := newMeAPI()
	api.call(t, "GET", "/api/v1/me", invitedHeader, "")
	api.call(t, "GET", "/api/v1/me", invitedHeader, "")
	if api.accounts.checks != 1 {
		t.Errorf("%d checks, want 1: normal requests shouldn't call Firebase", api.accounts.checks)
	}
}

func TestAFirebaseOutageMakesNoRowAndSaysTryAgain(t *testing.T) {
	api := newMeAPI()
	api.accounts.checkErr = errors.New("firebase is down")

	status, _ := api.call(t, "GET", "/api/v1/me", invitedHeader, "")

	if status != http.StatusServiceUnavailable {
		t.Errorf("status = %d, want 503, not 401: an outage isn't a deleted account", status)
	}
	if api.users.creates != 0 {
		t.Error("no row should be made")
	}
}

func TestACommitThatFailsAfterFirebaseSaysSoInTheLog(t *testing.T) {
	api := newMeAPI()
	api.call(t, "GET", "/api/v1/me", invitedHeader, "")
	api.users.deleteErr = users.ErrNotCommitted

	if status, _ := api.call(t, "DELETE", "/api/v1/me", invitedHeader, ""); status != http.StatusServiceUnavailable {
		t.Errorf("status = %d, want 503", status)
	}
	if !strings.Contains(api.logs.String(), "firebase user deleted, row still there") {
		t.Errorf("the log should name this case: %s", api.logs)
	}
}

// Decision 79: being taken off the invite list doesn't take away the right to delete your data.
func TestSomeoneNoLongerInvitedCanDeleteTheirAccount(t *testing.T) {
	api := newMeAPI()
	api.users.byUID["u2"] = users.User{ID: "id-u2", FirebaseUID: "u2", Email: "stranger@example.com"}
	strangerHeader := "Bearer " + strangerToken

	if status, _ := api.call(t, "GET", "/api/v1/me", strangerHeader, ""); status != http.StatusForbidden {
		t.Fatalf("GET /me: %d, want 403", status)
	}
	if status, _ := api.call(t, "DELETE", "/api/v1/me", strangerHeader, ""); status != http.StatusNoContent {
		t.Fatalf("DELETE /me: %d, want 204", status)
	}
	if _, ok := api.users.byUID["u2"]; ok || !api.accounts.gone["u2"] {
		t.Error("their row and Firebase user should be gone")
	}
}

func TestSomeoneWithNoRowsGetsTheirFirebaseUserDeletedAndNoRowMade(t *testing.T) {
	api := newMeAPI()

	status, _ := api.call(t, "DELETE", "/api/v1/me", "Bearer "+strangerToken, "")

	if status != http.StatusNoContent || !api.accounts.gone["u2"] {
		t.Errorf("status %d, gone %v; want 204 and the Firebase user gone", status, api.accounts.gone["u2"])
	}
	if api.users.creates != 0 {
		t.Error("deleting must never make a row")
	}
}

func TestDeletingTwiceAnswers204BothTimes(t *testing.T) {
	api := newMeAPI()
	api.call(t, "GET", "/api/v1/me", invitedHeader, "")

	for try := range 2 {
		if status, _ := api.call(t, "DELETE", "/api/v1/me", invitedHeader, ""); status != http.StatusNoContent {
			t.Errorf("try %d: %d, want 204: the first answer may have been lost", try, status)
		}
	}
}

func TestDeletingTouchesOnlyTheCallersAccount(t *testing.T) {
	api := newMeAPI()
	api.users.byUID["u1"] = users.User{ID: "id-u1", FirebaseUID: "u1", Email: "ewa@example.com"}

	api.call(t, "DELETE", "/api/v1/me", "Bearer "+strangerToken, "")

	if _, ok := api.users.byUID["u1"]; !ok || api.accounts.gone["u1"] {
		t.Error("another user's account should be untouched")
	}
}

func TestDeleteMeTakesGoogleSignInsOnly(t *testing.T) {
	store := &fakeUsers{byUID: map[string]users.User{}}
	accounts := &fakeAccounts{gone: map[string]bool{}}
	api := New(logging.New(io.Discard), Deps{
		DB:       fakeDB{},
		Tokens:   fakeTokens{"token-anon": {UID: "u9", SignInProvider: "anonymous"}},
		Users:    store,
		Accounts: accounts,
	}).Router()

	req := httptest.NewRequest("DELETE", "/api/v1/me", nil)
	req.Header.Set("Authorization", "Bearer token-anon")
	rec := httptest.NewRecorder()
	api.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", rec.Code)
	}
	if accounts.gone["u9"] {
		t.Error("nothing should be deleted")
	}
}

// DELETE /me sits outside requireUser, and a new route copied from it would too. Every route not
// listed here must refuse someone who isn't invited.
var notBehindTheInvite = map[string]bool{"GET /healthz": true, "POST /actions": true, "DELETE /me": true}

func TestEveryOtherRouteRefusesSomeoneNotInvited(t *testing.T) {
	api := New(logging.New(io.Discard), Deps{
		DB:      fakeDB{},
		Tokens:  fakeTokens{strangerToken: {UID: "u2", Email: "stranger@example.com", EmailVerified: true, SignInProvider: auth.GoogleProvider}},
		Users:   &fakeUsers{byUID: map[string]users.User{}},
		Invited: auth.NewAllowlist("ewa@example.com"),
	})
	for _, r := range api.routes() {
		name := r.method + " " + r.path
		if notBehindTheInvite[name] {
			continue
		}
		req := httptest.NewRequest(r.method, "/api/v1"+r.path, nil)
		req.Header.Set("Authorization", "Bearer "+strangerToken)
		rec := httptest.NewRecorder()
		r.handler(rec, req)
		if rec.Code != http.StatusForbidden {
			t.Errorf("%s: status = %d, want 403", name, rec.Code)
		}
	}
}
