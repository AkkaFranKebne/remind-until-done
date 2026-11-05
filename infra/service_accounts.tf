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

# API may delete a Firebase user when their account is deleted, and check one still exists before
# creating a row for them (decision 76). Its own small role: the ready-made roles/firebaseauth.admin
# could also create and change users, and change the sign-in settings.
resource "google_project_iam_custom_role" "api_firebase_users" {
  role_id     = "rudApiFirebaseUsers"
  title       = "RUD API: read and delete Firebase users"
  permissions = ["firebaseauth.users.delete", "firebaseauth.users.get"]
}

resource "google_project_iam_member" "api_firebase_users" {
  project = var.project_id
  role    = google_project_iam_custom_role.api_firebase_users.id
  member  = "serviceAccount:${google_service_account.api.email}"
}
