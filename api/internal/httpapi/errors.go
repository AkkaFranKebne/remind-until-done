package httpapi

import (
	"encoding/json"
	"net/http"
)

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

// writeError sends the API's error shape: {"error":{"code":"...","message":"..."}}.
func writeError(w http.ResponseWriter, status int, code, message string) {
	type apiError struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	}
	writeJSON(w, status, map[string]apiError{"error": {Code: code, Message: message}})
}
