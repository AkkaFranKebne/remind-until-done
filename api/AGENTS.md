# AGENTS.md: api/ (Go service)

Also read the root [`AGENTS.md`](../AGENTS.md). Design: design doc Appendix D (layout, interfaces) and section 3 (dispatcher).

## Commands
Run in `api/`. Needs Go (version in `go.mod`).

| Task | Command |
|---|---|
| Run on :8080 | `make run` |
| Format check / vet / tests | `make fmt vet test` |
| Docker image | `make docker` (Docker Desktop must be running) |
| Known vulnerabilities | `go run golang.org/x/vuln/cmd/govulncheck@latest ./...` |

## Rules
- Layout follows Appendix D: `cmd/api` (wiring), `internal/config`, `internal/httpapi` (HTTP only), feature packages (`reminders`, `dispatch`, ...).
- `httpapi` only translates HTTP to service calls. Business rules live in the feature packages.
- Only `scheduling` and `push` import Google SDKs for those jobs. Everything else uses their interfaces, so tests can use fakes.
- Public routes live under `/api/v1/` (Firebase Hosting forwards the full path). Cloud Tasks and Scheduler call `/internal/*`.
- Errors use one JSON shape: `{"error":{"code":"...","message":"..."}}` (`writeError` in `internal/httpapi/errors.go`).
- Logs: structured JSON through the logger from `internal/logging` (Cloud Logging reads `severity` and `message`).
- Settings come from env vars in `internal/config`. Terraform sets them on Cloud Run (`infra/cloud_run.tf`).
- Every reminder query filters by the signed-in `user_id`. Another user's row returns 404, not 403.

## Never
- Never build SQL by string concatenation. Use query parameters.
- Never log secrets, tokens or full connection strings.
- Never add an `/internal/*` route without the OIDC check (from M4).
- Never edit an applied migration. Add a new one (design doc 6.5).
