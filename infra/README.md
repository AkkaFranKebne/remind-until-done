# RUD infrastructure (Terraform)

One root module, one state per environment (`dev`, `prod`).
Source: design doc, Appendix B. `terraform validate` passes.

## Layout
```
infra/
  versions.tf          providers + GCS backend
  variables.tf         inputs
  apis.tf              enable GCP APIs
  artifact_registry.tf Docker repo for the Go image
  service_accounts.tf  runtime SA + invoker SA (OIDC for Tasks/Scheduler)
  wif.tf               GitHub Actions deploy identity (Workload Identity Federation)
  secrets.tf           Secret Manager containers (values set out-of-band); database-url (API, rud_app), database-migrate-url (Flyway, owner)
  cloud_run.tf         Go API service
  cloud_tasks.tf       reminders queue
  scheduler.tf         daily /internal/sweep job (03:00 UTC)
  monitoring.tf        budget (SEK), uptime check and alerts, mailed to alert_email
  outputs.tf
  envs/dev.tfvars
  envs/prod.tfvars
  envs/local.tfvars.example   copy to envs/<env>.local.tfvars (git-ignored): alert email, billing account
```
`firebase.json` (Hosting config, `/api/**` -> Cloud Run) lives outside Terraform.

## One-time bootstrap (done)
GCP projects, Firebase (Blaze, Google sign-in, Hosting), state buckets
`rud-tfstate-dev` / `rud-tfstate-prod`, Neon databases and the action-token key.
See design doc section 10.1.

## Apply (dev shown; use prod for prod)
Cloud Run reads the secrets at start, so they must have values before the
full apply. Otherwise the service fails to deploy. Apply in two steps.

```
gcloud auth login
gcloud auth application-default login
terraform init -reconfigure -backend-config="bucket=rud-tfstate-dev" -backend-config="prefix=rud"
```
Use `-reconfigure` when switching between dev and prod state.

Personal settings (the alert email and the billing account) stay out of the repo: copy
`envs/local.tfvars.example` to `envs/dev.local.tfvars` and `envs/prod.local.tfvars`, fill them in,
and pass the file after the env file on every plan and apply:
`-var-file=envs/dev.tfvars -var-file=envs/dev.local.tfvars`. Applying the budget needs your login
to be an admin (or costs manager) of the billing account.

A resource that reads an API before Terraform has switched it on (the browser key needs the API
Keys API) fails at plan time on a fresh project: apply the API first with
`-target='google_project_service.enabled["apikeys.googleapis.com"]'`, then plan everything.

1. Enable the APIs and create the empty secrets:
```
terraform apply -var-file=envs/dev.tfvars \
  -target='google_project_service.enabled' -target='google_secret_manager_secret.app'
```
2. Add the secret values (into the matching project):
```
printf '%s' "$NEON_URL"       | gcloud secrets versions add database-url     --data-file=- --project=rud-dev-4f7k2   # Neon's pooled URL; migrations switch to the direct host themselves
# ACTION_KEY: openssl rand -base64 32, a different one per environment
printf '%s' "$ACTION_KEY"     | gcloud secrets versions add action-token-key --data-file=- --project=rud-dev-4f7k2
printf '%s' "$ALLOWED_EMAILS" | gcloud secrets versions add allowed-emails   --data-file=- --project=rud-dev-4f7k2   # comma-separated tester Google emails
```
3. Create everything else:
```
terraform plan  -var-file=envs/dev.tfvars -var-file=envs/dev.local.tfvars -out=dev.tfplan
terraform apply dev.tfplan
```

Copy the `wif_provider` and `deployer_sa_email` outputs into GitHub environment
variables `WIF_PROVIDER` and `DEPLOYER_SA`. Terraform is applied manually from a
laptop in v1; the CI identity cannot change infrastructure.

## The app's database role (once per environment, dev first; decision 86)
The API logs in as `rud_app`, which may only read and write rows; Flyway keeps the owner's login
for schema changes. Two secrets: `database-url` (the API, `rud_app`) and `database-migrate-url`
(Flyway in `deploy.yml`, the owner). Migration `V4__app_role.sql` creates `rud_app` without login
and grants its rights; the password is set by hand here and never goes into the repo. Nothing
below prints a password. `P` is the project, e.g. `rud-dev-4f7k2`.

1. Apply Terraform (the new secret; the deployer reads it instead of `database-url`), then fill it
   with today's owner URL straight away, and merge the PR right after: until then a deploy of the
   old `main` can't read its secret and stops before Cloud Run.
```
terraform apply dev.tfplan
set -o pipefail   # a failed read must not add an empty version
gcloud secrets versions access latest --secret=database-url --project=P \
  | gcloud secrets versions add database-migrate-url --data-file=- --project=P
```
   For prod: the apply and this copy must happen before the next prod deploy run (which reads the
   new secret); if forgotten, that run stops at Flyway, before Cloud Run, and prod keeps serving.
2. Merge. The deploy runs `V4` as the owner: `rud_app` exists now, without login.
3. Make the password and save it in `database-url`, in one go. Paste the command as it is, with
   nothing to fill in: it makes a random password, adds it as a new version of `database-url`
   (`rud_app`, same host and database as the owner URL), and only then puts the finished SQL line
   on your clipboard. Nothing prints the password. (Copying a command from somewhere replaces the
   clipboard, so the password can't wait there for a later command; and Neon's editor adds quotes
   by itself, so the SQL comes ready with them.)
```
set -o pipefail; APP_PW="$(openssl rand -base64 24)"; gcloud secrets versions access latest --secret=database-migrate-url --project=P | APP_PW="$APP_PW" python3 -c 'import os,sys,urllib.parse as u; p=u.urlsplit(sys.stdin.read().strip()); port=f":{p.port}" if p.port else ""; print(p._replace(netloc="rud_app:"+u.quote(os.environ["APP_PW"],safe="")+"@"+p.hostname+port).geturl(), end="")' | gcloud secrets versions add database-url --data-file=- --project=P && printf "ALTER ROLE rud_app WITH LOGIN PASSWORD '%s';" "$APP_PW" | pbcopy; unset APP_PW
```
4. In the Neon console → SQL Editor (that environment's database): clear the editor, paste (⌘V),
   run. Neon's rule for passwords set in SQL is at least 60 bits of entropy; this has 192. Delete
   the query from the editor's history if it lets you. Until this runs, `database-url`'s new
   version doesn't match Neon, so do it straight away (the running revision isn't affected: it read
   the secret when it started).
5. Start a new revision (re-run the latest `deploy` workflow, or the next merge does it). Check:
   the smoke test says `"database":"ok"`, and in Neon
   `SELECT usename, count(*) FROM pg_stat_activity GROUP BY 1;` shows `rud_app`. If the API can't
   connect, use Undo below straight away: the new revision serves even without a database.
6. Disable the older versions of `database-url`: they still hold the owner's login, and the API's
   service account may read every version, not only the latest.
```
gcloud secrets versions list database-url --project=P
gcloud secrets versions disable <each older version number> --secret=database-url --project=P
```

Undo: add the owner URL back as a new version of `database-url` (the copy command of step 1,
with the two secret names swapped) and start a new revision. Disable that version again when
you switch back to `rud_app`.

## Add or remove a tester (invite list)
The list is the `allowed-emails` secret (comma-separated Google emails). The API
reads it when an instance starts, so a change needs a new revision.
```
printf '%s' "$ALLOWED_EMAILS" | gcloud secrets versions add allowed-emails --data-file=- --project=rud-dev-4f7k2
```
Then redeploy (re-run the latest `deploy` workflow), or wait until Cloud Run starts new instances.

Removing someone: also disable their user in the Firebase console (Authentication → Users).
Their sign-in stays valid for up to 1 hour after that, until it expires.

## Notes
- The Cloud Run service allows unauthenticated invocation, because the browser reaches it through the Firebase Hosting rewrite. `/internal/*` is protected in the Go app by verifying the OIDC token (audience = service URL, email = invoker SA).
- `service_url` uses Cloud Run's predictable URL, `https://rud-api-<project number>.<region>.run.app`, so it's known before the first apply (`gcloud projects describe <project-id> --format='value(projectNumber)'`).
- Region is `europe-west3` (Frankfurt) for everything: next to the Neon database. Not Stockholm (`europe-north2`): Firebase Hosting can't rewrite `/api/**` to Cloud Run there.
- Changing `region` replaces the Cloud Run service, Artifact Registry repo, Tasks queue and Scheduler job. That's safe: they hold no data (`deletion_protection = false` on Cloud Run for this reason). Update the GitHub variables `REGION`, `IMAGE` and `API_URL` afterwards.
- Neon is managed outside Terraform on purpose (keeps the state small and avoids a third-party provider).
