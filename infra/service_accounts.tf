# Identity the Go API runs as
resource "google_service_account" "api" {
  account_id   = "rud-api-${var.env}"
  display_name = "RUD API runtime (${var.env})"
}

# Identity Cloud Tasks and Cloud Scheduler use to call /internal/* (OIDC)
resource "google_service_account" "invoker" {
  account_id   = "rud-invoker-${var.env}"
  display_name = "RUD internal invoker (${var.env})"
}

# API may create tasks
resource "google_project_iam_member" "api_tasks_enqueuer" {
  project = var.project_id
  role    = "roles/cloudtasks.enqueuer"
  member  = "serviceAccount:${google_service_account.api.email}"
}

# API may send FCM messages
resource "google_project_iam_member" "api_fcm" {
  project = var.project_id
  role    = "roles/firebasecloudmessaging.admin"
  member  = "serviceAccount:${google_service_account.api.email}"
}

# API must be allowed to attach the invoker identity to the tasks it creates
resource "google_service_account_iam_member" "api_acts_as_invoker" {
  service_account_id = google_service_account.invoker.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.api.email}"
}

# Invoker may call Cloud Run
resource "google_cloud_run_v2_service_iam_member" "invoker_can_run" {
  name     = google_cloud_run_v2_service.api.name
  location = google_cloud_run_v2_service.api.location
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.invoker.email}"
}

# Browser traffic arrives via the Firebase Hosting rewrite, so the service is public.
# /internal/* is protected inside the app by OIDC verification.
resource "google_cloud_run_v2_service_iam_member" "public" {
  name     = google_cloud_run_v2_service.api.name
  location = google_cloud_run_v2_service.api.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}
