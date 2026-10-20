package httpapi

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/AkkaFranKebne/remind-until-done/api/internal/auth"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/dbtest"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/devices"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/logging"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/reminders"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/users"
)

const (
	alice = "Bearer token-alice"
	bob   = "Bearer token-bob"
)

// newRemindersAPI is the real API (reminders and devices) on a throwaway database. Only the
// sign-in is fake.
func newRemindersAPI(t *testing.T) http.Handler {
	t.Helper()
	pool := dbtest.Start(t)
	return New(logging.New(io.Discard), Deps{
		DB: fakeDB{},
		Tokens: fakeTokens{
			"token-alice": {UID: "u-alice", Email: "alice@example.com", EmailVerified: true, SignInProvider: auth.GoogleProvider},
			"token-bob":   {UID: "u-bob", Email: "bob@example.com", EmailVerified: true, SignInProvider: auth.GoogleProvider},
		},
		Users:     users.NewRepo(pool),
		Reminders: reminders.NewService(pool),
		Devices:   devices.NewService(pool),
		Invited:   auth.NewAllowlist("alice@example.com,bob@example.com"),
	}).Router()
}

type response struct {
	status int
	body   map[string]any
	raw    string
}

func send(t *testing.T, h http.Handler, method, path, authHeader, body string) response {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if authHeader != "" {
		req.Header.Set("Authorization", authHeader)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	res := response{status: rec.Code, raw: rec.Body.String()}
	if res.raw != "" {
		if err := json.Unmarshal(rec.Body.Bytes(), &res.body); err != nil {
			t.Fatalf("%s %s: body is not JSON: %v\n%s", method, path, err, res.raw)
		}
	}
	return res
}

func dueIn(hours int) string {
	return time.Now().Add(time.Duration(hours) * time.Hour).UTC().Format(time.RFC3339)
}

func createVia(t *testing.T, h http.Handler, who, title string, hours int) string {
	t.Helper()
	res := send(t, h, "POST", "/api/v1/reminders", who, fmt.Sprintf(`{"title":%q,"dueAt":%q}`, title, dueIn(hours)))
	if res.status != 201 {
		t.Fatalf("create %q: %d %s", title, res.status, res.raw)
	}
	return res.body["id"].(string)
}

func TestRemindersNeedSignIn(t *testing.T) {
	h := newRemindersAPI(t)
	for _, route := range []string{
		"GET /api/v1/reminders", "POST /api/v1/reminders",
		"GET /api/v1/reminders/x", "PATCH /api/v1/reminders/x",
		"DELETE /api/v1/reminders/x", "POST /api/v1/reminders/x/done",
	} {
		method, path, _ := strings.Cut(route, " ")
		if res := send(t, h, method, path, "", ""); res.status != 401 || errorCode(res.body) != "unauthorized" {
			t.Errorf("%s without a token: %d %q, want 401 unauthorized", route, res.status, errorCode(res.body))
		}
	}
}

func TestReminderLifecycleOverHTTP(t *testing.T) {
	h := newRemindersAPI(t)

	// Create: 201 with the whole Reminder.
	res := send(t, h, "POST", "/api/v1/reminders", alice,
		fmt.Sprintf(`{"title":"Pay rent","note":"to Anna","dueAt":%q,"nagIntervalMin":30}`, dueIn(2)))
	if res.status != 201 {
		t.Fatalf("create: %d %s", res.status, res.raw)
	}
	id := res.body["id"].(string)
	want := map[string]any{"title": "Pay rent", "note": "to Anna", "status": "pending", "nagIntervalMin": 30.0, "nagCount": 0.0, "nagsExhausted": false, "doneAt": nil, "sentAt": nil, "nextNagAt": nil}
	for k, v := range want {
		if res.body[k] != v {
			t.Errorf("created %s = %v, want %v", k, res.body[k], v)
		}
	}
	if due, _ := res.body["dueAt"].(string); !strings.HasSuffix(due, "Z") {
		t.Errorf("dueAt %q, want a UTC time (ending in Z)", due)
	}

	// Get.
	if res = send(t, h, "GET", "/api/v1/reminders/"+id, alice, ""); res.status != 200 || res.body["id"] != id {
		t.Errorf("get: %d %s", res.status, res.raw)
	}

	// Edit: "note": null clears it, the title stays.
	if res = send(t, h, "PATCH", "/api/v1/reminders/"+id, alice, `{"note":null}`); res.status != 200 || res.body["note"] != nil || res.body["title"] != "Pay rent" {
		t.Errorf("clear note: %d %s", res.status, res.raw)
	}

	// Done (twice: same answer).
	if res = send(t, h, "POST", "/api/v1/reminders/"+id+"/done", alice, ""); res.status != 200 || res.body["status"] != "done" || res.body["doneAt"] == nil {
		t.Errorf("done: %d %s", res.status, res.raw)
	}
	if again := send(t, h, "POST", "/api/v1/reminders/"+id+"/done", alice, ""); again.status != 200 || again.body["doneAt"] != res.body["doneAt"] {
		t.Errorf("done again: %d %s", again.status, again.raw)
	}

	// Lists: done, then upcoming is empty.
	if res = send(t, h, "GET", "/api/v1/reminders?status=done", alice, ""); res.status != 200 || len(res.body["items"].([]any)) != 1 || res.body["nextCursor"] != nil {
		t.Errorf("list done: %d %s", res.status, res.raw)
	}
	if res = send(t, h, "GET", "/api/v1/reminders", alice, ""); res.status != 200 || len(res.body["items"].([]any)) != 0 {
		t.Errorf("list upcoming: %d %s, want items: []", res.status, res.raw)
	}

	// Delete: 204 with no body, then 404.
	if res = send(t, h, "DELETE", "/api/v1/reminders/"+id, alice, ""); res.status != 204 || res.raw != "" {
		t.Errorf("delete: %d %q", res.status, res.raw)
	}
	if res = send(t, h, "GET", "/api/v1/reminders/"+id, alice, ""); res.status != 404 || errorCode(res.body) != "not_found" {
		t.Errorf("get after delete: %d %s", res.status, res.raw)
	}
}

// The next push time goes out as nextNagAt, in UTC like every other time.
func TestReminderJSONHasNextNagAtInUTC(t *testing.T) {
	stockholm := time.FixedZone("CEST", 2*60*60)
	next := time.Date(2026, 10, 15, 16, 30, 0, 0, stockholm)
	got := toReminderJSON(reminders.Reminder{NextNagAt: &next})
	if got.NextNagAt == nil || got.NextNagAt.Location() != time.UTC || !got.NextNagAt.Equal(next) {
		t.Fatalf("nextNagAt = %v, want %v in UTC", got.NextNagAt, next.UTC())
	}
	if raw, _ := json.Marshal(got); !strings.Contains(string(raw), `"nextNagAt":"2026-10-15T14:30:00Z"`) {
		t.Errorf("JSON %s, want nextNagAt 2026-10-15T14:30:00Z", raw)
	}
	if none := toReminderJSON(reminders.Reminder{}); none.NextNagAt != nil {
		t.Errorf("no next nag: nextNagAt = %v, want null", none.NextNagAt)
	}
}

func TestAnotherUsersReminderIsNotFound(t *testing.T) {
	h := newRemindersAPI(t)
	id := createVia(t, h, alice, "Alice's", 1)

	for _, c := range []struct{ method, path, body string }{
		{"GET", "/api/v1/reminders/" + id, ""},
		{"PATCH", "/api/v1/reminders/" + id, `{"title":"Bob's now"}`},
		{"POST", "/api/v1/reminders/" + id + "/done", ""},
		{"DELETE", "/api/v1/reminders/" + id, ""},
	} {
		// 404, not 403: Bob can't even learn that the reminder exists.
		if res := send(t, h, c.method, c.path, bob, c.body); res.status != 404 || errorCode(res.body) != "not_found" {
			t.Errorf("bob %s: %d %s, want 404 not_found", c.method, res.status, res.raw)
		}
	}
	if res := send(t, h, "GET", "/api/v1/reminders/"+id, alice, ""); res.status != 200 || res.body["title"] != "Alice's" {
		t.Errorf("alice's reminder after bob tried: %d %s", res.status, res.raw)
	}
}

func TestSixthActiveReminderIs409(t *testing.T) {
	h := newRemindersAPI(t)
	for i := range reminders.MaxActive {
		createVia(t, h, alice, "r", i+1)
	}
	res := send(t, h, "POST", "/api/v1/reminders", alice, fmt.Sprintf(`{"title":"sixth","dueAt":%q}`, dueIn(9)))
	if res.status != 409 || errorCode(res.body) != "limit_reached" {
		t.Errorf("6th: %d %s, want 409 limit_reached", res.status, res.raw)
	}
	// Bob has his own 5.
	createVia(t, h, bob, "bob's first", 1)
}

func TestBadRequestsAre400(t *testing.T) {
	h := newRemindersAPI(t)
	id := createVia(t, h, alice, "x", 1)
	for name, c := range map[string]struct{ method, path, body string }{
		"not JSON":           {"POST", "/api/v1/reminders", `title=x`},
		"title missing":      {"POST", "/api/v1/reminders", fmt.Sprintf(`{"dueAt":%q}`, dueIn(1))},
		"dueAt missing":      {"POST", "/api/v1/reminders", `{"title":"x"}`},
		"dueAt not a time":   {"POST", "/api/v1/reminders", `{"title":"x","dueAt":"tomorrow"}`},
		"dueAt in the past":  {"POST", "/api/v1/reminders", fmt.Sprintf(`{"title":"x","dueAt":%q}`, dueIn(-1))},
		"unknown field":      {"POST", "/api/v1/reminders", fmt.Sprintf(`{"title":"x","dueAt":%q,"colour":"red"}`, dueIn(1))},
		"nag interval low":   {"PATCH", "/api/v1/reminders/" + id, `{"nagIntervalMin":5}`},
		"note not text":      {"PATCH", "/api/v1/reminders/" + id, `{"note":42}`},
		"bad status filter":  {"GET", "/api/v1/reminders?status=overdue", ""},
		"limit not a number": {"GET", "/api/v1/reminders?limit=many", ""},
		"bad cursor":         {"GET", "/api/v1/reminders?cursor=abc", ""},
		"junk after JSON":    {"PATCH", "/api/v1/reminders/" + id, `{"title":"y"} garbage`},
		"NUL in title":       {"PATCH", "/api/v1/reminders/" + id, `{"title":"a\u0000b"}`},
	} {
		if res := send(t, h, c.method, c.path, alice, c.body); res.status != 400 || errorCode(res.body) != "validation_failed" {
			t.Errorf("%s: %d %s, want 400 validation_failed", name, res.status, res.raw)
		}
	}
}

func TestListPagesOverHTTP(t *testing.T) {
	h := newRemindersAPI(t)
	for i := range 3 {
		createVia(t, h, alice, fmt.Sprintf("r%d", i), i+1)
	}
	first := send(t, h, "GET", "/api/v1/reminders?limit=2", alice, "")
	cursor, _ := first.body["nextCursor"].(string)
	if first.status != 200 || len(first.body["items"].([]any)) != 2 || cursor == "" {
		t.Fatalf("page 1: %d %s", first.status, first.raw)
	}
	second := send(t, h, "GET", "/api/v1/reminders?limit=2&cursor="+cursor, alice, "")
	items := second.body["items"].([]any)
	if second.status != 200 || len(items) != 1 || items[0].(map[string]any)["title"] != "r2" || second.body["nextCursor"] != nil {
		t.Errorf("page 2: %d %s", second.status, second.raw)
	}
}
