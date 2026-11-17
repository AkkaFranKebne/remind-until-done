# rud. — Remind Until Done

A to-do reminder that doesn't give up. You set a reminder, and it keeps sending push notifications, each one a little more insistent, until you tap **Done**.

- Live app: https://rud-prod-4f7k2.web.app. It's invite-only while in testing.
- Built by one frontend developer learning fullstack, working with AI coding agents. The process is described under [How it's built](#how-its-built).

## How it works

```
 Phone (PWA)  ──sign in──▶  Firebase Auth (Google)
     │
     │ create a reminder
     ▼
 Go API on Cloud Run ──saves──▶ Postgres (Neon)
     │
     │ books one timed task per push
     ▼
 Cloud Tasks ──at the right time──▶ API /internal/tasks/fire ──▶ Firebase Cloud Messaging ──▶ push on the phone
                                         │
                                         └─ books the next nag, until you tap Done

 Cloud Scheduler, daily ──▶ API sweep: finds and repairs any lost task
```

- **One task per push.** Each nag is its own Cloud Task with a fixed name built from the reminder, its version and the push number. A retry can't send the same push twice, and editing a reminder makes the old tasks harmless.
- **A safety net.** A daily sweep rebooks any chain that broke, for example after a network blip, and an alert email reports when it did.
- **Done from the notification.** The push carries a signed, short-lived token that can do only one thing, mark that reminder done, so tapping Done works without opening the app.

## Stack

| Area | What |
|---|---|
| `web/` | React, TypeScript, Vite, TanStack Router and Query, Base UI, Tailwind, React Hook Form + Zod; a PWA with its own service worker. API client generated from the OpenAPI contract (orval). |
| `api/` | Go, standard library `net/http`, Postgres via pgx, Flyway migrations. One service on Cloud Run. |
| `infra/` | Terraform for two Google Cloud projects, dev and prod: Cloud Run, Cloud Tasks, Cloud Scheduler, Secret Manager, Monitoring alerts, Firebase Hosting and Auth. |
| CI/CD | GitHub Actions. Merging to `main` deploys to dev; prod is a manual run. |

## Things worth a look

- **Contract first.** `api/swagger.json` is the API contract. The web client and its mock handlers are generated from it, so the two sides can't drift apart.
- **Tests at every level.**
  - Go: unit tests, plus database tests against a real Postgres in Docker, using testcontainers.
  - Web: Jest and Testing Library for components, MSW for the API, Playwright for end-to-end runs with axe accessibility checks, and Storybook stories with the a11y addon.
- **Safe database changes.** Every migration has to work with the release that's still running, because deploys migrate first, then switch the code. The recipe is in `.claude/skills/new-migration`.
- **Security.**
  - No keys anywhere: the deploys log in to Google Cloud with Workload Identity Federation, and only `deploy.yml` on `main` of this repo can.
  - Secrets live in Secret Manager.
  - GitHub Actions are pinned to commit SHAs and updated by Dependabot.
  - gitleaks and Semgrep run in CI.
  - A strict Content Security Policy is enforced.
- **Accessibility.** Designed for screen readers and keyboard use from the start, with colour contrast checked by a test (`web/src/tokens.contrast.test.ts`) and reduced motion respected.
- **Cheap CI.** A PR runs only the jobs its files need (`scripts/ci_changes.py`).

## How it's built

- The [design doc](https://claude.ai/artifact/BXDpFvgmBqmRxs7aPtq5yH) decides what gets built. Every decision made while building goes into it, with the reason.
- The [Design Inventory](https://claude.ai/artifact/Lyv8dnTRRDg6hwa3jxP2ws) lists every screen, component, token, piece of copy and accessibility rule. UI changes are checked against it.
- `AGENTS.md` files, one at the root and one per area, hold the rules for AI agents and people alike.
- Review agents in `.claude/agents` check each PR before it's merged: one for UI and accessibility, one for security. Recipes for repeated jobs are in `.claude/skills`.
- PR descriptions are written as study notes, in plain language and with comparisons to frontend ideas. Reading the merged PRs in order tells the whole story.

## Run it locally

The commands for each area are in [`AGENTS.md`](AGENTS.md#commands). In short, with Docker running:

```sh
make db-up migrate        # repo root: local Postgres + migrations
cd api && make run        # the API
cd web && nvm use && npm ci && npm run dev   # the web app
```
