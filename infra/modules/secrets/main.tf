variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "service_account_emails" {
  description = "Service account emails to grant secret access"
  type        = list(string)
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

locals {
  secret_sa_pairs = flatten([
    for secret in var.secret_names : [
      for email in var.service_account_emails : {
        secret_key = secret
        email      = email
      }
    ]
  ])
}

resource "google_secret_manager_secret_iam_member" "cloud_run_access" {
  for_each  = { for pair in local.secret_sa_pairs : "${pair.secret_key}-${pair.email}" => pair }
  secret_id = google_secret_manager_secret.secrets[each.value.secret_key].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${each.value.email}"
}

output "secret_ids" {
  description = "Map of secret names to resource IDs"
  value       = { for k, v in google_secret_manager_secret.secrets : k => v.id }
}
