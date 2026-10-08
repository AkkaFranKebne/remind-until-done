variable "project_id" {
  type        = string
  description = "GCP / Firebase project ID"
}

variable "region" {
  type        = string
  description = "Region for Cloud Run and Artifact Registry. europe-west3 = Frankfurt, next to the Neon database. Not Stockholm (europe-north2): Firebase Hosting cannot rewrite /api to Cloud Run there."
  default     = "europe-west3"
}

variable "tasks_region" {
  type        = string
  description = "Region for the Cloud Tasks queue (Frankfurt, same as the API). Tasks carry only ids, no personal data"
  default     = "europe-west3"
}

variable "scheduler_region" {
  type        = string
  description = "Region for the Cloud Scheduler job (Frankfurt, same as the API)"
  default     = "europe-west3"
}

variable "env" {
  type        = string
  description = "dev or prod"
  validation {
    condition     = contains(["dev", "prod"], var.env)
    error_message = "env must be dev or prod."
  }
}

variable "image" {
  type        = string
  description = "Initial container image; CI deploys newer ones"
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "service_url" {
  type        = string
  description = "Cloud Run URL, used as OIDC audience. Use the predictable form https://rud-api-<project number>.<region>.run.app"
  default     = ""
}

variable "max_instances" {
  type    = number
  default = 2
}

variable "github_repo" {
  type        = string
  description = "GitHub repository allowed to deploy, as owner/name"
}

variable "github_repository_id" {
  type        = string
  description = "Numeric id of the GitHub repository (gh api repos/OWNER/NAME -q .id)"
}

variable "github_owner_id" {
  type        = string
  description = "Numeric id of the GitHub repository owner (gh api repos/OWNER/NAME -q .owner.id)"
}
