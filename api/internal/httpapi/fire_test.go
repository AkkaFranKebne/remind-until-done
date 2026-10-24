package httpapi

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/AkkaFranKebne/remind-until-done/api/internal/dispatch"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/logging"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/scheduling"
)

// fakeDispatcher remembers the task and answers err.
type fakeDispatcher struct {
	got *scheduling.Body
	err error
}

func (f *fakeDispatcher) Fire(_ context.Context, t scheduling.Body) error {
	f.got = &t
	return f.err
}

func fire(t *testing.T, d *fakeDispatcher, body string) int {
	t.Helper()
	api := New(logging.New(io.Discard), Deps{DB: fakeDB{}, Invoker: fakeInvoker{}, Dispatcher: d})
	req := httptest.NewRequest("POST", "/internal/tasks/fire", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer good")
	rec := httptest.NewRecorder()
	api.Router().ServeHTTP(rec, req)
	return rec.Code
}

const taskBody = `{"reminderId":"0b3f6c1e-8d2a-4f5b-9c7e-1a2b3c4d5e6f","version":1042,"n":3}`

func TestFireTask(t *testing.T) {
	d := &fakeDispatcher{}
	if status := fire(t, d, taskBody); status != http.StatusNoContent {
		t.Errorf("status = %d, want 204", status)
	}
	want := scheduling.Body{ReminderID: "0b3f6c1e-8d2a-4f5b-9c7e-1a2b3c4d5e6f", Version: 1042, N: 3}
	if d.got == nil || *d.got != want {
		t.Errorf("fired %+v, want %+v", d.got, want)
	}
}

func TestFireTaskAnswersSoCloudTasksRetriesOnlyFailures(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want int
	}{
		{"FCM said try later", dispatch.ErrTryLater, http.StatusServiceUnavailable},
		{"database problem", errors.New("connection reset"), http.StatusInternalServerError},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if status := fire(t, &fakeDispatcher{err: tt.err}, taskBody); status != tt.want {
				t.Errorf("status = %d, want %d", status, tt.want)
			}
		})
	}
}

func TestFireTaskRefusesBadBodies(t *testing.T) {
	for _, body := range []string{
		`{}`,
		`{"reminderId":"not-a-uuid","version":1,"n":0}`,
		`{"reminderId":"0b3f6c1e-8d2a-4f5b-9c7e-1a2b3c4d5e6f","version":0,"n":0}`,
		`{"reminderId":"0b3f6c1e-8d2a-4f5b-9c7e-1a2b3c4d5e6f","version":1,"n":-1}`,
		`{"reminderId":"0b3f6c1e-8d2a-4f5b-9c7e-1a2b3c4d5e6f","version":1,"n":12}`,
		`{"reminderId":"0b3f6c1e-8d2a-4f5b-9c7e-1a2b3c4d5e6f","version":1,"n":0,"extra":true}`,
	} {
		d := &fakeDispatcher{}
		if status := fire(t, d, body); status != http.StatusBadRequest || d.got != nil {
			t.Errorf("%s: status = %d, fired = %v, want 400 and nothing fired", body, status, d.got != nil)
		}
	}
}
