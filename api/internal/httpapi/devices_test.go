package httpapi

import (
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestDevicesNeedSignIn(t *testing.T) {
	h := newRemindersAPI(t)
	for _, route := range []string{"GET /api/v1/devices", "POST /api/v1/devices", "DELETE /api/v1/devices/x"} {
		method, path, _ := strings.Cut(route, " ")
		if res := send(t, h, method, path, "", ""); res.status != 401 || errorCode(res.body) != "unauthorized" {
			t.Errorf("%s without a token: %d %q, want 401 unauthorized", route, res.status, errorCode(res.body))
		}
	}
}

func TestDeviceLifecycleOverHTTP(t *testing.T) {
	h := newRemindersAPI(t)

	// Nothing registered yet: an empty list, not null.
	res := send(t, h, "GET", "/api/v1/devices", alice, "")
	if res.status != 200 || res.raw != `{"items":[]}`+"\n" {
		t.Fatalf("empty list: %d %s", res.status, res.raw)
	}

	// Register: 200 with the Device. The user agent comes from the request header; the token is
	// never sent back.
	req := httptest.NewRequest("POST", "/api/v1/devices", strings.NewReader(`{"fcmToken":"tok-1","platform":"ios"}`))
	req.Header.Set("Authorization", alice)
	req.Header.Set("User-Agent", "Mozilla/5.0 (iPhone)")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("register: %d %s", rec.Code, rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), "tok-1") || strings.Contains(rec.Body.String(), "fcmToken") {
		t.Fatalf("the push token came back: %s", rec.Body.String())
	}
	res = send(t, h, "GET", "/api/v1/devices", alice, "")
	items, _ := res.body["items"].([]any)
	if len(items) != 1 {
		t.Fatalf("list after register: %s", res.raw)
	}
	device, _ := items[0].(map[string]any)
	id, _ := device["id"].(string)
	if device["platform"] != "ios" || device["userAgent"] != "Mozilla/5.0 (iPhone)" || id == "" {
		t.Fatalf("device: %v", device)
	}
	for _, field := range []string{"createdAt", "lastSeenAt"} {
		when, _ := device[field].(string)
		if parsed, err := time.Parse(time.RFC3339Nano, when); err != nil || parsed.Location() != time.UTC {
			t.Errorf("%s = %q, want a UTC time", field, when)
		}
	}

	// Bob can't see or delete alice's device.
	if res := send(t, h, "GET", "/api/v1/devices", bob, ""); res.raw != `{"items":[]}`+"\n" {
		t.Errorf("bob sees: %s", res.raw)
	}
	if res := send(t, h, "DELETE", "/api/v1/devices/"+id, bob, ""); res.status != 404 || errorCode(res.body) != "not_found" {
		t.Errorf("bob deletes alice's device: %d %q, want 404 not_found", res.status, errorCode(res.body))
	}

	// Alice unregisters it (sign-out): 204, then it's gone.
	if res := send(t, h, "DELETE", "/api/v1/devices/"+id, alice, ""); res.status != 204 || res.raw != "" {
		t.Fatalf("delete: %d %s", res.status, res.raw)
	}
	if res := send(t, h, "DELETE", "/api/v1/devices/"+id, alice, ""); res.status != 404 {
		t.Errorf("delete again: %d, want 404", res.status)
	}
}

func TestRegisterDeviceBadRequestsAre400(t *testing.T) {
	h := newRemindersAPI(t)
	for name, body := range map[string]string{
		"missing token":    `{"platform":"ios"}`,
		"missing platform": `{"fcmToken":"t"}`,
		"unknown field":    `{"fcmToken":"t","platform":"ios","extra":1}`,
		"other platform":   `{"fcmToken":"t","platform":"windows"}`,
		"empty token":      `{"fcmToken":"","platform":"ios"}`,
		"not JSON":         `nope`,
	} {
		if res := send(t, h, "POST", "/api/v1/devices", alice, body); res.status != 400 || errorCode(res.body) != "validation_failed" {
			t.Errorf("%s: %d %q, want 400 validation_failed", name, res.status, errorCode(res.body))
		}
	}
}

func TestANewPhoneReplacesTheOldOne(t *testing.T) {
	h := newRemindersAPI(t)
	first := send(t, h, "POST", "/api/v1/devices", alice, `{"fcmToken":"old-phone","platform":"ios"}`)
	again := send(t, h, "POST", "/api/v1/devices", alice, `{"fcmToken":"old-phone","platform":"ios"}`)
	if first.body["id"] != again.body["id"] {
		t.Fatalf("the same token again got a new id: %v vs %v", first.body["id"], again.body["id"])
	}

	second := send(t, h, "POST", "/api/v1/devices", alice, `{"fcmToken":"new-phone","platform":"android"}`)
	if second.body["id"] == first.body["id"] {
		t.Fatal("a new phone kept the old id: the old phone couldn't tell it was replaced")
	}
	res := send(t, h, "GET", "/api/v1/devices", alice, "")
	items, _ := res.body["items"].([]any)
	if len(items) != 1 {
		t.Fatalf("devices: %s, want only the new one", res.raw)
	}
	if device, _ := items[0].(map[string]any); device["id"] != second.body["id"] || device["platform"] != "android" {
		t.Errorf("listed %v, want the new phone", device)
	}
}
