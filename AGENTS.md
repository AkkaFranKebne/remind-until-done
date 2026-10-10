# AGENTS.md: RUD (Remind Until Done)

Rules for AI agents (and people) working in this repo. Area rules live next to the code:
[`web/AGENTS.md`](web/AGENTS.md), [`api/AGENTS.md`](api/AGENTS.md), [`infra/AGENTS.md`](infra/AGENTS.md).

## What this is
A PWA that keeps sending push notifications until you tap Done. Monorepo:

| Folder | What | Stack |
|---|---|---|
| `web/` | Frontend (React PWA) | React 19, TypeScript, Vite, Jest |
| `api/` | Backend (one service on Cloud Run) | Go, net/http |
| `infra/` | Google Cloud setup | Terraform |
| `.github/workflows/` | CI (`ci.yml`) and deploy (`deploy.yml`) | GitHub Actions |

## Source of truth
- **The design doc** decides what to build: https://claude.ai/artifact/BXDpFvgmBqmRxs7aPtq5yH
  - Read the relevant section before designing or coding a feature.
  - If the code and the doc disagree, or the doc disagrees with itself: **stop and ask**. Don't guess.
  - Decisions made while building go into the doc (section 9.1).
- **Config files** decide the numbers (lint limits, versions, regions). This file never repeats a number; it points to the config.

## Who you're working with
The owner is a frontend developer learning fullstack.
- Short sentences, plain language, an example for every new backend/infra idea.
- Compare to frontend concepts where it helps ("Makefile = npm scripts").

## Workflow
- Never commit to `main`. Branch → PR → owner merges.
- Branch names: `area/short-topic` (e.g. `api/healthz`, `web/login`, `infra/region`, `chore/...`).
- **PR descriptions are study notes.** Plain language, short sentences, bullets, frontend comparisons for new ideas.
  - Sections: `.github/pull_request_template.md` (the only list).
  - Check before opening: `python3 scripts/check_pr_body.py <file>`. CI runs the same script (`pr-check.yml`).
  - In Claude Code: `/create-pr` does all of this.
- Run the checks below before pushing. The Git hooks run some of them; CI runs all of them.

## Commands
Run from the folder named.

| Where | Check | Command |
|---|---|---|
| `web/` | everything CI runs | `npm run lint && npm run format:check && npm run typecheck && npm test && npm run build` |
| `api/` | everything CI runs | `make fmt vet test` (needs Docker running: database tests start their own Postgres) |
| `infra/` | format + validate | `terraform fmt -check -recursive && terraform validate` |
| repo root | local database | `make db-up migrate` (Postgres in Docker + Flyway); `make psql` for a SQL prompt |
| repo root | secret scan | `gitleaks git --redact` |
| repo root | PR description | `python3 scripts/check_pr_body.py <file>` (tests: `python3 scripts/test_check_pr_body.py`) |

## Never
- Never commit secrets: keys, tokens, connection strings, `.env` files. Secret values live in Google Secret Manager only (`infra/secrets.tf` holds the names).
- Never add GitHub secrets. Deploy logs in with Workload Identity Federation (no keys).
- Never run `terraform apply` against **prod**. Prepare a saved plan (`terraform plan -out=...`); the owner applies it.
- Never skip hooks (`--no-verify`) or turn off a lint rule to make a check pass. Fix the code, or ask.
- Never deploy by hand. Deploys go through `deploy.yml` (merge → dev; manual run with `prod` → prod).
- Never edit generated files (e.g. `web/src/lib/api/generated/` once it exists).

## Environments
| | dev | prod |
|---|---|---|
| App | https://rud-dev-4f7k2.web.app | https://rud-prod-4f7k2.web.app |
| Google project | `rud-dev-4f7k2` | `rud-prod-4f7k2` |
| Deploy | automatic on merge to `main` | manual run of `deploy.yml`, type `prod` |

Region and other settings: `infra/envs/*.tfvars` and the GitHub environment variables.

## Known traps
- **Firebase Hosting rewrites to Cloud Run only work in some regions.** `europe-north2` (Stockholm) is not one. Check before changing the region.
- **Terraform state is per environment.** Switch with `terraform init -reconfigure -backend-config="bucket=rud-tfstate-<env>" -backend-config="prefix=rud"`. Always check which one is active before `plan`/`apply`.
- **Cloud Run URLs** use the predictable form `https://rud-api-<project number>.<region>.run.app` (`service_url` in tfvars).
- **npm 11 blocks package install scripts** by default. That's intended; don't approve them without a reason.
- **Node version** comes from `.nvmrc`. Run `nvm use` first.

## Deferred work (do it when its milestone starts)
- M1 (wrap-up): MCP docs servers; Storybook MCP (agents read real component props).
- M2 (reminders): first skills ("new endpoint", "new migration"); semgrep.
- M2 (detail screens): TopBar tones for the vivid detail gradients (nag-low, overdue, done, waiting, nag-high). The current logo/icon colours fail contrast there; decide the look with the screens, update the Inventory, then add the tones.
- M4 (dispatcher): OIDC check on every `/internal/*` route, with a 401 test.
- M7 (hardening): Content-Security-Policy in `web/firebase.json`, report-only first (design doc 7.1).
- Any time: pin GitHub Actions by commit SHA; remove Editor from the default compute service account.

## Review agents
- `ui-reviewer` (`.claude/agents/ui-reviewer.md`): checks frontend changes against the UI rules in `web/AGENTS.md` and the Design Inventory. Run it on every PR that touches `web/src/`.
