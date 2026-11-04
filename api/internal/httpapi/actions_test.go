package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/AkkaFranKebne/remind-until-done/api/internal/actiontoken"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/logging"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/scheduling"
)

var testActions = actiontoken.NewSigner("a test key that is long enough for this")

func tokenBody(t *testing.T, token string) string {
	t.Helper()
	raw, err := json.Marshal(map[string]string{"token": token})
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

func doneToken(id string, version int) string {
	return testActions.Sign(id, version, actiontoken.Done, time.Hour)
}

func TestActionMarksDoneWithoutSignIn(t *testing.T) {
	tasks := &scheduling.Fake{}
	h := newRemindersAPIWithTasks(t, tasks)
	id := createVia(t, h, alice, "Call the bank", 1)
	body := tokenBody(t, doneToken(id, tasks.Tasks()[0].Version))

	res := send(t, h, "POST", "/api/v1/actions", "", body)
	if res.status != http.StatusOK || res.body["status"] != "done" || res.body["reminderId"] != id {
		t.Fatalf("first tap: %d %s", res.status, res.raw)
	}
	got := send(t, h, "GET", "/api/v1/reminders/"+id, alice, "")
	if got.body["status"] != "done" || got.body["line"] == nil {
		t.Errorf("after the tap: %s, want done with a done line", got.raw)
	}
	if again := send(t, h, "POST", "/api/v1/actions", "", body); again.status != http.StatusOK {
		t.Errorf("second tap: %d %s", again.status, again.raw)
	}
	if after := send(t, h, "GET", "/api/v1/reminders/"+id, alice, ""); after.body["line"] != got.body["line"] {
		t.Errorf("second tap changed the line: %v to %v", got.body["line"], after.body["line"])
	}
}

func TestActionFromBeforeAnEditStopsWorking(t *testing.T) {
	tasks := &scheduling.Fake{}
	h := newRemindersAPIWithTasks(t, tasks)
	id := createVia(t, h, alice, "Call the bank", 1)
	body := tokenBody(t, doneToken(id, tasks.Tasks()[0].Version))
	if res := send(t, h, "PATCH", "/api/v1/reminders/"+id, alice, `{"dueAt":"`+dueIn(3)+`"}`); res.status != http.StatusOK {
		t.Fatalf("edit: %d %s", res.status, res.raw)
	}

	res := send(t, h, "POST", "/api/v1/actions", "", body)
	if res.status != http.StatusUnauthorized || !strings.Contains(res.raw, "invalid_action_token") {
		t.Errorf("old token: %d %s, want 401", res.status, res.raw)
	}
	if got := send(t, h, "GET", "/api/v1/reminders/"+id, alice, ""); got.body["status"] == "done" {
		t.Error("an old token marked the reminder done")
	}
}

func TestActionForAReminderThatIsGone(t *testing.T) {
	h := newRemindersAPIWithTasks(t, &scheduling.Fake{})
	res := send(t, h, "POST", "/api/v1/actions", "", tokenBody(t, doneToken("7f9c2a54-1111-4222-8333-444455556666", 1)))
	if res.status != http.StatusNotFound {
		t.Errorf("%d %s, want 404", res.status, res.raw)
	}
}

// No Reminders here: reaching the database would crash the test. A stranger's guesses can't wake it.
func TestBadActionsNeverReachTheDatabaseOrTheLogs(t *testing.T) {
	var logs bytes.Buffer
	h := New(logging.New(&logs), Deps{DB: fakeDB{}, Actions: testActions}).Router()
	other := actiontoken.NewSigner("another key that is long enough for this")
	bad := []string{
		"not-a-token",
		other.Sign("7f9c2a54-1111-4222-8333-444455556666", 1, actiontoken.Done, time.Hour),
		testActions.Sign("7f9c2a54-1111-4222-8333-444455556666", 1, actiontoken.Done, -time.Second),
	}
	for _, token := range bad {
		res := send(t, h, "POST", "/api/v1/actions", "", tokenBody(t, token))
		if res.status != http.StatusUnauthorized {
			t.Errorf("%q: %d %s, want 401", token, res.status, res.raw)
		}
		if strings.Contains(logs.String(), token) {
			t.Errorf("%q is in the logs", token)
		}
	}
	for _, body := range []string{`{}`, `not json`, `{"token":"x","extra":1}`} {
		if res := send(t, h, "POST", "/api/v1/actions", "", body); res.status != http.StatusBadRequest {
			t.Errorf("%s: %d %s, want 400", body, res.status, res.raw)
		}
	}
}
