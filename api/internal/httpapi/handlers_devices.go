package httpapi

import (
	"errors"
	"net/http"
	"time"

	"github.com/AkkaFranKebne/remind-until-done/api/internal/devices"
)

// deviceJSON is the Device schema in swagger.json. The push token is never sent back.
type deviceJSON struct {
	ID         string    `json:"id"`
	Platform   string    `json:"platform"`
	UserAgent  *string   `json:"userAgent"`
	CreatedAt  time.Time `json:"createdAt"`
	LastSeenAt time.Time `json:"lastSeenAt"`
}

func toDeviceJSON(d devices.Device) deviceJSON {
	return deviceJSON{
		ID: d.ID, Platform: d.Platform, UserAgent: d.UserAgent,
		CreatedAt: d.CreatedAt.UTC(), LastSeenAt: d.LastSeenAt.UTC(),
	}
}

// writeDeviceError maps the service's errors to HTTP (design doc 2.2, Errors).
func (a *API) writeDeviceError(w http.ResponseWriter, r *http.Request, err error) {
	var verr devices.ValidationError
	switch {
	case errors.As(err, &verr):
		writeError(w, http.StatusBadRequest, "validation_failed", verr.Message)
	case errors.Is(err, devices.ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found", "no such device")
	default:
		// Ids only: push tokens are never logged (design doc 7.5).
		a.log.ErrorContext(r.Context(), "devices failed",
			"user_id", currentUser(r.Context()).ID, "device_id", r.PathValue("id"), "err", err)
		writeError(w, http.StatusInternalServerError, "internal", "something went wrong")
	}
}

// GET /api/v1/devices: the user's device, as a list of 0 or 1.
func (a *API) listDevices(w http.ResponseWriter, r *http.Request) {
	d, err := a.devices.Get(r.Context(), currentUser(r.Context()).ID)
	if err != nil {
		a.writeDeviceError(w, r, err)
		return
	}
	items := []deviceJSON{}
	if d != nil {
		items = append(items, toDeviceJSON(*d))
	}
	writeJSON(w, http.StatusOK, map[string][]deviceJSON{"items": items})
}

// POST /api/v1/devices: register this browser's push token (replaces the user's previous device).
func (a *API) registerDevice(w http.ResponseWriter, r *http.Request) {
	var body struct { // RegisterDevice in swagger.json
		FCMToken *string `json:"fcmToken"`
		Platform *string `json:"platform"`
	}
	if !decodeBody(w, r, &body) {
		return
	}
	if body.FCMToken == nil || body.Platform == nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "fcmToken and platform are required")
		return
	}
	d, err := a.devices.Register(r.Context(), currentUser(r.Context()).ID, devices.RegisterInput{
		FCMToken: *body.FCMToken, Platform: *body.Platform, UserAgent: r.UserAgent(),
	})
	if err != nil {
		a.writeDeviceError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, toDeviceJSON(d))
}

// DELETE /api/v1/devices/{id}: unregister (sign-out).
func (a *API) deleteDevice(w http.ResponseWriter, r *http.Request) {
	if err := a.devices.Delete(r.Context(), currentUser(r.Context()).ID, r.PathValue("id")); err != nil {
		a.writeDeviceError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
