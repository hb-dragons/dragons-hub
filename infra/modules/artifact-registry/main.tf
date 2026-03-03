variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
}

variable "repository_id" {
  description = "Repository ID"
  type        = string
  default     = "dragons"
}

resource "google_artifact_registry_repository" "main" {
  location      = var.region
  repository_id = var.repository_id
  description   = "Docker images for dragons applications"
  format        = "DOCKER"

  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"

    most_recent_versions {
      keep_count = 10
    }
  }

  cleanup_policies {
    id     = "delete-old-untagged"
    action = "DELETE"

    condition {
      tag_state  = "UNTAGGED"
      older_than = "604800s"
    }
  }
}

output "repository_url" {
  description = "Full repository URL"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.main.repository_id}"
}

output "repository_id" {
  description = "Repository ID"
  value       = google_artifact_registry_repository.main.repository_id
}
