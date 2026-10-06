resource "google_artifact_registry_repository" "api" {
  location      = var.region
  repository_id = "rud-${var.env}"
  format        = "DOCKER"
  description   = "RUD API images"

  depends_on = [google_project_service.enabled]
}
