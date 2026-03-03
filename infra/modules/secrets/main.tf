variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "project_number" {
  description = "GCP project number"
  type        = string
}

variable "secret_names" {
  description = "List of secret names to create"
  type        = list(string)
}

variable "secret_values" {
  description = "Map of secret names to their values"
  type        = map(string)
  sensitive   = true
}

resource "google_secret_manager_secret" "secrets" {
  for_each  = toset(var.secret_names)
  secret_id = each.key

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "versions" {
  for_each    = toset(var.secret_names)
  secret      = google_secret_manager_secret.secrets[each.key].id
  secret_data = var.secret_values[each.key]
}

resource "google_secret_manager_secret_iam_member" "cloud_run_access" {
  for_each  = toset(var.secret_names)
  secret_id = google_secret_manager_secret.secrets[each.key].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.project_number}-compute@developer.gserviceaccount.com"
}

output "secret_ids" {
  description = "Map of secret names to resource IDs"
  value       = { for k, v in google_secret_manager_secret.secrets : k => v.id }
}
