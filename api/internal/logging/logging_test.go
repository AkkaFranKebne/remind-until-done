package logging

import (
	"bytes"
	"encoding/json"
	"testing"
)

func TestNewUsesCloudLoggingKeys(t *testing.T) {
	var buf bytes.Buffer
	New(&buf).Warn("disk almost full", "free_mb", 12)

	var got map[string]any
	if err := json.Unmarshal(buf.Bytes(), &got); err != nil {
		t.Fatalf("log line is not JSON: %v\n%s", err, buf.String())
	}
	if got["severity"] != "WARNING" {
		t.Errorf("severity = %v, want WARNING", got["severity"])
	}
	if got["message"] != "disk almost full" {
		t.Errorf("message = %v, want %q", got["message"], "disk almost full")
	}
	if got["free_mb"] != float64(12) {
		t.Errorf("free_mb = %v, want 12", got["free_mb"])
	}
}
