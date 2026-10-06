output "api_url" {
  value = google_cloud_run_v2_service.api.uri
}

output "app_url" {
  description = "The app address: the project's default Firebase Hosting site"
  value       = "https://${var.project_id}.web.app"
}

output "image_repo" {
  value = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.api.repository_id}"
}

output "invoker_sa_email" {
  value = google_service_account.invoker.email
}

output "wif_provider" {
  description = "Set as GitHub variable WIF_PROVIDER"
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "deployer_sa_email" {
  description = "Set as GitHub variable DEPLOYER_SA"
  value       = google_service_account.deployer.email
}
