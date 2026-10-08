variable "project_id" {
  type        = string
  description = "GCP / Firebase project ID"
}

variable "region" {
  type        = string
  description = "Region for Cloud Run and Artifact Registry. europe-north2 = Stockholm (Cloud Run is available there; confirm Artifact Registry)"
  default     = "europe-north2"
}

variable "tasks_region" {
  type        = string
  description = "Region for the Cloud Tasks queue. Stockholm is not confirmed for Cloud Tasks, so this defaults to Belgium. Tasks carry only ids, no personal data"
  default     = "europe-west1"
}

variable "scheduler_region" {
  type        = string
  description = "Region for the Cloud Scheduler job (confirm Stockholm support before changing)"
  default     = "europe-west1"
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
  description = "Cloud Run URL, used as OIDC audience. Empty on first apply, set on the second."
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
