package push

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
	"time"

	"google.golang.org/api/option"
)

const reminderID = "0b3f6c1e-8d2a-4f5b-9c7e-1a2b3c4d5e6f"

var msg = Message{ReminderID: reminderID, Title: "Pay rent", Body: "Still waiting for you.", URL: "/r/" + reminderID, Attempt: 3, MaxAttempts: 12,
	SentAt: time.Date(2026, 10, 23, 21, 5, 0, 0, time.FixedZone("CEST", 2*3600)), DoneToken: "a-done-token"}

// fcmServer stands in for FCM: it answers every send with this status and body,
// and keeps the last request body.
func fcmServer(t *testing.T, status int, body string, delay time.Duration) (*FCM, *[]byte) {
	t.Helper()
	var got []byte
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || r.URL.Path != "/projects/rud-dev-4f7k2/messages:send" {
			t.Errorf("%s %s, want POST /projects/rud-dev-4f7k2/messages:send", r.Method, r.URL.Path)
		}
		got, _ = io.ReadAll(r.Body)
		select {
		case <-time.After(delay):
		case <-r.Context().Done():
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = io.WriteString(w, body)
	}))
	t.Cleanup(srv.Close)
	f, err := NewFCM(context.Background(), "rud-dev-4f7k2", option.WithEndpoint(srv.URL), option.WithoutAuthentication())
	if err != nil {
		t.Fatal(err)
	}
	return f, &got
}

// fcmError is FCM's error answer (FCM HTTP v1 API).
func fcmError(httpCode int, status, errorCode string) string {
	return `{"error":{"code":` + itoa(httpCode) + `,"message":"x","status":"` + status + `",
	  "details":[{"@type":"type.googleapis.com/google.firebase.fcm.v1.FcmError","errorCode":"` + errorCode + `"}]}}`
}

func itoa(n int) string { b, _ := json.Marshal(n); return string(b) }

func TestSendIsADataOnlyWebPush(t *testing.T) {
	f, got := fcmServer(t, 200, `{"name":"projects/rud-dev-4f7k2/messages/1"}`, 0)
	if o, err := f.Send(context.Background(), "phone-token", msg); o != Accepted || err != nil {
		t.Fatalf("Send() = %v, %v, want accepted", o, err)
	}

	var req struct {
		Message struct {
			Token        string            `json:"token"`
			Data         map[string]string `json:"data"`
			Notification any               `json:"notification"`
			Webpush      struct {
				Headers      map[string]string `json:"headers"`
				Notification any               `json:"notification"`
			} `json:"webpush"`
		} `json:"message"`
	}
	if err := json.Unmarshal(*got, &req); err != nil {
		t.Fatal(err)
	}
	m := req.Message
	if m.Token != "phone-token" {
		t.Errorf("token = %q", m.Token)
	}
	// What web/src/sw/notification.ts reads.
	want := map[string]string{"reminderId": reminderID, "title": "Pay rent", "body": "Still waiting for you.", "url": "/r/" + reminderID, "attempt": "3", "maxAttempts": "12", "sentAt": "2026-10-23T19:05:00Z", "doneToken": "a-done-token"}
	if len(m.Data) != len(want) {
		t.Errorf("data = %v, want %v", m.Data, want)
	}
	for k, v := range want {
		if m.Data[k] != v {
			t.Errorf("data[%s] = %q, want %q", k, m.Data[k], v)
		}
	}
	// A notification block would make the browser show FCM's notification, not ours.
	if m.Notification != nil || m.Webpush.Notification != nil {
		t.Error("the push has a notification block, want data only")
	}
	h := m.Webpush.Headers
	if h["Urgency"] != "high" || h["TTL"] != "86400" {
		t.Errorf("webpush headers = %v, want Urgency high and TTL 86400 (a day)", h)
	}
	// Web push topics: at most 32 characters, URL-safe base64 alphabet.
	if h["Topic"] != "0b3f6c1e8d2a4f5b9c7e1a2b3c4d5e6f" || !regexp.MustCompile(`^[A-Za-z0-9_-]{1,32}$`).MatchString(h["Topic"]) {
		t.Errorf("Topic = %q, want the reminder id without dashes", h["Topic"])
	}
}

func TestSendOutcomes(t *testing.T) {
	tests := []struct {
		name   string
		status int
		body   string
		want   Outcome
	}{
		{"token unregistered", 404, fcmError(404, "NOT_FOUND", "UNREGISTERED"), TokenGone},
		{"token from another project", 403, fcmError(403, "PERMISSION_DENIED", "SENDER_ID_MISMATCH"), TokenGone},
		// The SDK retries a 503 by itself, until our send timeout: this case takes 5 seconds.
		{"FCM unavailable", 503, fcmError(503, "UNAVAILABLE", "UNAVAILABLE"), TryLater},
		{"FCM internal error", 500, fcmError(500, "INTERNAL", "INTERNAL"), TryLater},
		{"too many pushes", 429, fcmError(429, "RESOURCE_EXHAUSTED", "QUOTA_EXCEEDED"), TryLater},
		// Could be our payload: deleting the device would punish the user for our bug.
		{"invalid argument", 400, fcmError(400, "INVALID_ARGUMENT", "INVALID_ARGUMENT"), TryLater},
		{"not JSON", 502, "<html>bad gateway</html>", TryLater},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f, _ := fcmServer(t, tt.status, tt.body, 0)
			o, err := f.Send(context.Background(), "phone-token", msg)
			if o != tt.want || err == nil {
				t.Errorf("Send() = %v, %v, want %v with an error", o, err, tt.want)
			}
			if err != nil && strings.Contains(err.Error(), "phone-token") {
				t.Errorf("the error quotes the token: %v", err)
			}
		})
	}
}

func TestSendCutsALongErrorShort(t *testing.T) {
	f, _ := fcmServer(t, 502, "<html>"+strings.Repeat("bad gateway ", 1000)+"</html>", 0)
	o, err := f.Send(context.Background(), "phone-token", msg)
	if o != TryLater || err == nil || len(err.Error()) > maxErrorText+len("…") {
		t.Errorf("Send() = %v, error of %d bytes, want try_later and at most %d", o, len(err.Error()), maxErrorText)
	}
}

func TestSendGivesUpAfterTheTimeout(t *testing.T) {
	if testing.Short() {
		t.Skip("waits for the send timeout")
	}
	f, _ := fcmServer(t, 200, `{"name":"x"}`, sendTimeout+5*time.Second)
	start := time.Now()
	if o, err := f.Send(context.Background(), "phone-token", msg); o != TryLater || err == nil {
		t.Errorf("Send() = %v, %v, want try_later", o, err)
	}
	if waited := time.Since(start); waited > sendTimeout+2*time.Second {
		t.Errorf("waited %v, want about %v", waited, sendTimeout)
	}
}
