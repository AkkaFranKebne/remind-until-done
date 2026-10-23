package scheduling

import (
	"encoding/json"
	"testing"
	"time"
)

func testCloudTasks(now time.Time) *CloudTasks {
	return &CloudTasks{
		queuePath:    "projects/rud-dev-4f7k2/locations/europe-west3/queues/reminders",
		serviceURL:   "https://rud-api-1.europe-west3.run.app",
		invokerEmail: "rud-invoker-dev@rud-dev-4f7k2.iam.gserviceaccount.com",
		now:          func() time.Time { return now },
	}
}

func TestRequest(t *testing.T) {
	now := time.Date(2026, 10, 23, 12, 0, 0, 0, time.UTC)
	at := now.Add(time.Hour)
	req := testCloudTasks(now).request(Task{ReminderID: "abc", Version: 1042, N: 3, At: at})

	if req.Parent != "projects/rud-dev-4f7k2/locations/europe-west3/queues/reminders" {
		t.Errorf("parent = %q", req.Parent)
	}
	task := req.Task
	if task.Name != req.Parent+"/tasks/r-abc-v1042-n3" {
		t.Errorf("name = %q, want r-{id}-v{version}-n{n} in the queue", task.Name)
	}
	if !task.ScheduleTime.AsTime().Equal(at) {
		t.Errorf("schedule time = %v, want %v", task.ScheduleTime.AsTime(), at)
	}
	h := task.GetHttpRequest()
	if h.Url != "https://rud-api-1.europe-west3.run.app/internal/tasks/fire" || h.HttpMethod.String() != "POST" {
		t.Errorf("%s %s, want POST {SERVICE_URL}/internal/tasks/fire", h.HttpMethod, h.Url)
	}
	// The /internal check (auth.Invoker) accepts exactly this: made for SERVICE_URL, by the invoker.
	oidc := h.GetOidcToken()
	if oidc.Audience != "https://rud-api-1.europe-west3.run.app" || oidc.ServiceAccountEmail != "rud-invoker-dev@rud-dev-4f7k2.iam.gserviceaccount.com" {
		t.Errorf("token for %q as %q, want SERVICE_URL and INVOKER_SA_EMAIL", oidc.Audience, oidc.ServiceAccountEmail)
	}
	var body map[string]any
	if err := json.Unmarshal(h.Body, &body); err != nil {
		t.Fatal(err)
	}
	if len(body) != 3 || body["reminderId"] != "abc" || body["version"] != 1042.0 || body["n"] != 3.0 {
		t.Errorf("body = %s, want only {reminderId, version, n}", h.Body)
	}
}

func TestRequestNeverFiresBeforeTheCommit(t *testing.T) {
	now := time.Date(2026, 10, 23, 12, 0, 0, 0, time.UTC)
	// Due a moment ago (the app allows a minute of clock difference): still a few seconds out.
	req := testCloudTasks(now).request(Task{ReminderID: "abc", Version: 1, At: now.Add(-30 * time.Second)})
	if got := req.Task.ScheduleTime.AsTime(); !got.Equal(now.Add(minLead)) {
		t.Errorf("schedule time = %v, want now + %v", got, minLead)
	}
}
