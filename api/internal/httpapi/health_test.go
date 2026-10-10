package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http/httptest"
	"testing"

	"github.com/AkkaFranKebne/remind-until-done/api/internal/logging"
)

// countingDB counts pings and fails the first failFirst of them.
type countingDB struct {
	calls     int
	failFirst int
}

func (c *countingDB) Ping(context.Context) error {
	c.calls++
	if c.calls <= c.failFirst {
		return errors.New("asleep")
	}
	return nil
}

func newTestAPI(db Pinger) *API {
	api := New(logging.New(io.Discard), db)
	api.health.retryWait = 0
	return api
}

func healthzDatabase(t *testing.T, api *API) string {
	t.Helper()
	rec := httptest.NewRecorder()
	api.Router().ServeHTTP(rec, httptest.NewRequest("GET", "/api/v1/healthz", nil))
	if rec.Code != 200 {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	return body["database"]
}

func TestHealthzCallersNeverPingTheDatabase(t *testing.T) {
	db := &countingDB{}
	api := newTestAPI(db)
	api.CheckDatabase(context.Background())

	for range 10 {
		if got := healthzDatabase(t, api); got != "ok" {
			t.Fatalf("database = %q, want ok", got)
		}
	}
	if db.calls != 1 {
		t.Errorf("pings = %d, want 1 (only the startup check)", db.calls)
	}
}

func TestCheckDatabaseRetriesWhileNeonWakesUp(t *testing.T) {
	db := &countingDB{failFirst: 2}
	api := newTestAPI(db)

	if !api.CheckDatabase(context.Background()) {
		t.Fatal("CheckDatabase() = false, want true on the third try")
	}
	if db.calls != 3 {
		t.Errorf("pings = %d, want 3", db.calls)
	}
}

func TestCheckDatabaseGivesUpAfterThreeTries(t *testing.T) {
	db := &countingDB{failFirst: 99}
	api := newTestAPI(db)

	if api.CheckDatabase(context.Background()) {
		t.Fatal("CheckDatabase() = true, want false")
	}
	if db.calls != 3 {
		t.Errorf("pings = %d, want 3", db.calls)
	}
	if got := healthzDatabase(t, api); got != "unavailable" {
		t.Errorf("database = %q, want unavailable", got)
	}
}

func TestHealthzBeforeTheCheckSaysUnavailable(t *testing.T) {
	if got := healthzDatabase(t, newTestAPI(&countingDB{})); got != "unavailable" {
		t.Errorf("database = %q, want unavailable until CheckDatabase has run", got)
	}
}
