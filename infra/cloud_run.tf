resource "google_cloud_run_v2_service" "api" {
  name     = "rud-api"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  # The service is stateless (code lives in the image, data in Neon), so Terraform
  # may delete and re-create it, e.g. to move regions.
  deletion_protection = false

  template {
    service_account = google_service_account.api.email

    scaling {
      min_instance_count = 0
      max_instance_count = var.max_instances
    }

    containers {
      image = var.image

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        # Pay per request: CPU only while a request runs, nothing while the instance waits.
        # Must be set here: with `limits` set and this left out, Cloud Run bills the whole time
        # an instance is up, and the uptime check keeps one up all day (2026-11-12, about 80 kr
        # in 11 days, paid by the free-trial credit). The API does no work outside requests.
        cpu_idle = true
      }

      env {
        name  = "ENV"
        value = var.env
      }
      env {
        name  = "GCP_PROJECT"
        value = var.project_id
      }
      env {
        name  = "TASKS_LOCATION"
        value = var.tasks_region
      }
      env {
        name  = "TASKS_QUEUE"
        value = google_cloud_tasks_queue.reminders.name
      }
      env {
        name  = "INVOKER_SA_EMAIL"
        value = google_service_account.invoker.email
      }
      env {
        name  = "SERVICE_URL"
        value = var.service_url
      }
      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.app["database-url"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "ALLOWED_EMAILS"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.app["allowed-emails"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "ACTION_TOKEN_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.app["action-token-key"].secret_id
            version = "latest"
          }
        }
      }
    }
  }

  # CI deploys new images; Terraform must not roll them back.
  # Service-level scaling is filled in by Google (all zeros) and would show as a diff on every plan.
  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      client,
      client_version,
      scaling,
    ]
  }

  depends_on = [google_project_service.enabled]
}
