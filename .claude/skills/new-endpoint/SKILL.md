---
name: new-endpoint
description: Add or change a public API endpoint in api/ (Go) end to end — swagger.json contract, feature package rules, httpapi handler, route, tests, regenerated web client and docs. Use when building a signed-in route from swagger.json, adding a new one, or changing an endpoint's request or response shape. Not for routes with their own kind of login (/internal/*, /actions).
---

# New API endpoint

The recipe the reminders API (PR #18) and `nextNagAt` (PR #22) followed. Rules it relies on live in `api/AGENTS.md`; read it first. Run Go commands in `api/`.

## 0. Know what to build
- Read the design doc: section 2.2 (endpoints, errors), Appendix A (`swagger.json`), and the milestone's decisions in 9.1.
- If the doc, `swagger.json` and the code disagree, or a detail is missing (a limit, an error code, what another user's row returns): **stop and ask the owner**. Record the answer as a 9.1 decision.
- **This recipe covers signed-in routes only** (`requireUser`). Routes with their own kind of login are out of scope; **stop and ask the owner** before building one:
  - `/internal/*` (Cloud Tasks, Scheduler): the OIDC check (M4); never add one without it.
  - `POST /actions` (`security: []` in `swagger.json`): anonymous, the signed token in the body is the login (decision 72). A route like it needs its own design: tokens that expire, are never logged, and can't be guessed to wake the database.

## 1. Contract first: `api/swagger.json`
- Add or change the path, its parameters, request body, responses and schemas. This file is the single source of truth: the web client is generated from it.
- Put limits in the schema (`maxLength`, `minimum`, `maximum`, `required`). The web forms read them from the generated constants, so they are never typed twice.
- Errors use the `Error` schema (`{"error":{"code","message"}}`) through the shared responses in `components.responses` (`BadRequest`, `Unauthorized`, `NotFound`, `LimitReached`, `NotInvited`), with the codes from design doc 2.2 (`validation_failed`, `not_found`, `limit_reached`, ...). Reuse them; add a new shared response only for a new kind of error.
- Building a route already in `swagger.json`? Remove it from `notBuiltYet` in `internal/httpapi/router_contract_test.go`.

## 2. Business rules: the feature package (`internal/<feature>`)
- Rules live here, not in `httpapi`: validation (return a `ValidationError` with a user-readable message), limits, state changes. Sentinel errors (`ErrNotFound`, `ErrLimitReached`) tell the handler which HTTP status to use.
- Every query filters by the signed-in `user_id`. Another user's row is `ErrNotFound` (404), never 403.
- SQL uses query parameters only, never string building.
- Several rows in one change: one transaction. Locks always in the same order (the user's row first, then the reminder), or two requests can wait for each other forever.
- New package or new store? The handler sees it through a small interface in `internal/httpapi/router.go` (like `ReminderStore`), added to `Deps` and wired in `cmd/api/main.go`. Tests can then pass a fake.
- Times: store and compare `timestamptz` instants; never format for a time zone here.

## 3. HTTP: `internal/httpapi/handlers_<feature>.go`
- The handler only translates: read the path/query/body, call the service with `currentUser(r.Context()).ID`, write the answer.
- Bodies: `decodeBody` (one JSON object, unknown fields refused, size-limited). Required fields are pointers, so "missing" and "zero" differ.
- Answers: a `...JSON` struct that mirrors the `swagger.json` schema field by field; times in UTC (`.UTC()`); `writeJSON` with the documented status (201 for create, 204 with no body for delete).
- Errors: one `write<Feature>Error` that maps the service's errors to `writeError` codes. Unexpected errors are logged with ids only (no titles, notes, emails or tokens) and answered `500 internal`.
- Don't set caching headers: `apiHeaders` already adds `Cache-Control: no-store` to every answer.

## 4. The route: `API.routes()` in `internal/httpapi/router.go`
- One line, path without `/api/v1`, exactly as in `swagger.json`: `{"POST", "/reminders/{id}/done", a.requireUser(a.markReminderDone)}`.
- Every route this recipe builds is wrapped in `requireUser` (401 without a token, 403 `not_invited`). Only `/healthz` is public, plus the own-login routes in step 0.

## 5. Tests
- **Service** (`internal/<feature>/service_test.go`): `dbtest.Start(t)` gives a real, throwaway Postgres with the migrations applied (Docker must run). Test every rule and limit, and that another user's row is not found.
- **HTTP** (`internal/httpapi/<feature>_test.go`): the real API on a throwaway database, only sign-in faked (`newRemindersAPI` + `send` with the `alice` / `bob` tokens is the pattern). Cover at least:
  - success: status and the JSON shape (field names as in `swagger.json`, times in UTC);
  - no token → 401;
  - bob asks for alice's row → 404;
  - a bad body (missing field, unknown field, value out of range) → 400 `validation_failed`;
  - the limits (e.g. the 6th active reminder → 409).
- **Contract**: `router_contract_test.go` runs on its own and fails if a served route is missing from `swagger.json` or a `swagger.json` route is neither served nor in `notBuiltYet`.
- Run `make fmt vet test`.

## 6. The web client
- In `web/`: `npm run api:generate`, then commit everything it changed in `src/lib/api/generated/` (CI regenerates and fails on any difference). Never edit those files by hand.
- If an existing web test or MSW mock relied on the old shape, update it.
- `npm run dev:mock` has its own fake API, `web/src/mocks/devApi.ts`. Add the endpoint there (and change its rules if they changed), with a case in `devApi.test.ts`, so mock mode behaves like the real API. Otherwise the request falls through to the network in mock mode and fails there only.
- Then run the web checks from the root `AGENTS.md`.

## 7. Docs and review
- Design doc: gaps you filled go into 9.1 (one decision row); keep 2.2 and Appendix A in step with `swagger.json`.
- `api/AGENTS.md`: add a rule if this endpoint introduced a new pattern (a lock, a new kind of check).
- Run the `security-reviewer` agent (API auth and database code), and the `ui-reviewer` if `web/src` changed beyond generated files. Fix and re-run until NO BLOCKING FINDINGS.
- PR with `/create-pr`; branch `api/<topic>`.
