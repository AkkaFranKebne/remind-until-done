package httpapi

import (
	"errors"
	"net/http"
	"strings"
	"testing"

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
