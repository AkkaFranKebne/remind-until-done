package httpapi

import (
	"net/http"
	"strings"
)

// requireInvoker lets a request through only with a Google ID token from our
// invoker account, the identity Cloud Tasks and Cloud Scheduler call with
// (design doc 7.1, Appendix D.8). Router wraps every /internal/* path in it, so a
// new internal route can't forget it. No verifier (a test that didn't set one)
// refuses everything. The token itself is never logged.
func (a *API) requireInvoker(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		if !ok || token == "" || a.invoker == nil {
			writeError(w, http.StatusUnauthorized, "unauthorized", "invalid internal caller")
			return
		}
		if err := a.invoker.Verify(r.Context(), token); err != nil {
			// Info, not Warn: anyone on the internet can trigger this line.
			a.log.InfoContext(r.Context(), "internal caller rejected", "err", err)
			writeError(w, http.StatusUnauthorized, "unauthorized", "invalid internal caller")
			return
		}
		next(w, r)
	}
}
