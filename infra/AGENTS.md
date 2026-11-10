# AGENTS.md: infra/ (Terraform)

Also read the root [`AGENTS.md`](../AGENTS.md) and [`README.md`](README.md) (setup steps).

## Commands
Run in `infra/`. Needs `gcloud auth application-default login`.

| Task | Command |
|---|---|
| Format + validate | `terraform fmt -check -recursive && terraform validate` |
| Switch environment | `terraform init -reconfigure -backend-config="bucket=rud-tfstate-<env>" -backend-config="prefix=rud"` |
| Dry run | `terraform plan -var-file=envs/<env>.tfvars -var-file=envs/<env>.local.tfvars -out=<env>.tfplan` (the local file is git-ignored: the alert email and billing account, see `envs/local.tfvars.example`) |
| Apply (dev only, see below) | `terraform apply <env>.tfplan` |

## Rules
- Check resources and arguments with the `terraform` MCP server (current Registry docs) before writing them; our pinned provider version is in `versions.tf`, so read the docs for that major version.
- One root module, one state per environment. Settings per environment: `envs/dev.tfvars`, `envs/prod.tfvars`.
- Always change **dev first**, check it, then prepare prod.
- **Prod: never apply.** Save a plan file and give the owner the exact `terraform apply` command.
- Show the plan summary (`N to add, N to change, N to destroy`) before applying. Explain every "destroy" or "must be replaced".
- After an apply, run `plan` again and expect "No changes".
- Secret **values** never go into Terraform (code or state). `secrets.tf` creates empty secrets; values are added with `gcloud secrets versions add`.
- Least privilege: give each service account only the roles it uses. Explain every new role in a comment.
- Terraform never manages the Cloud Run image (`ignore_changes`). CI deploys images.
- Personal values (an email, the billing account id) go in `envs/<env>.local.tfvars`, never in a committed file.
- Monitoring (`monitoring.tf`, design doc 7.6): alerts mail `var.alert_email`. Log-based alerts match our app's stdout logs (`local.app_logs`), not Cloud Run's request log, which marks every 5xx as ERROR. A new alert gets a `documentation` block that says where to look. The uptime check stays every 5 minutes: it keeps an instance warm most of the time, so new instances (each pings the database once at start) rarely wake Neon. Variables with personal values are `sensitive`, and the budget counts spending before credits (`EXCLUDE_ALL_CREDITS`), so trial credit can't hide a spike. The budget is in SEK, the billing account's currency, through the `google.billing` provider alias.

## Never
- Never commit `*.tfstate`, `*.tfplan` or `.terraform/` (already in `.gitignore`).
- Never widen the Workload Identity condition in `wif.tf` (only `deploy.yml` on `main`, matching environment).
- Never grant `roles/owner`, `roles/editor` or IAM admin roles to a service account.
