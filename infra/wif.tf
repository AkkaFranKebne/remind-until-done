# GitHub Actions deploys without long-lived keys (Workload Identity Federation).
# Terraform itself is applied manually in v1; this identity can only deploy the app.

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github-${var.env}"
  display_name              = "GitHub Actions (${var.env})"

  depends_on = [google_project_service.enabled]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"

  attribute_mapping = {
    "google.subject"         = "assertion.sub"
    "attribute.repository"   = "assertion.repository"
    "attribute.ref"          = "assertion.ref"
    "attribute.workflow_ref" = "assertion.workflow_ref"
    "attribute.environment"  = "assertion.environment"
  }

  # Only deploy.yml, running on main, in this environment (dev or prod), may log in.
  # Numeric ids, not names: a deleted or renamed repo name could be re-created by someone else.
  attribute_condition = join(" && ", [
    "assertion.repository_id == \"${var.github_repository_id}\"",
    "assertion.repository_owner_id == \"${var.github_owner_id}\"",
    "assertion.ref == \"refs/heads/main\"",
    "assertion.workflow_ref == \"${var.github_repo}/.github/workflows/deploy.yml@refs/heads/main\"",
    "assertion.environment == \"${var.env}\"",
  ])

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account" "deployer" {
  account_id   = "rud-deployer-${var.env}"
  display_name = "RUD CI deployer (${var.env})"
}

resource "google_service_account_iam_member" "deployer_via_github" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repo}"
}

# Deploy new Cloud Run revisions
resource "google_project_iam_member" "deployer_run" {
  project = var.project_id
  role    = "roles/run.developer"
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

# Push images
resource "google_artifact_registry_repository_iam_member" "deployer_push" {
  location   = google_artifact_registry_repository.api.location
  repository = google_artifact_registry_repository.api.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.deployer.email}"
}

# Deploying a revision that runs as the API service account
resource "google_service_account_iam_member" "deployer_acts_as_api" {
  service_account_id = google_service_account.api.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deployer.email}"
}

# Deploy the frontend
resource "google_project_iam_member" "deployer_hosting" {
  project = var.project_id
  role    = "roles/firebasehosting.admin"
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

# Read the owner's database URL, only to run Flyway migrations in deploy.yml before each
# deploy (design doc 6.4). Only this one secret, not the others (not the app's database-url).
resource "google_secret_manager_secret_iam_member" "deployer_reads_migrate_url" {
  secret_id = google_secret_manager_secret.app["database-migrate-url"].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.deployer.email}"
}
