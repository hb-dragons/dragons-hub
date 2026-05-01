variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "project_number" {
  description = "GCP project number (numeric)"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "europe-west3"
}

variable "github_org" {
  description = "GitHub organization or user name"
  type        = string
}

variable "github_repo" {
  description = "GitHub repository name"
  type        = string
  default     = "dragons-hub"
}

variable "web_domain" {
  description = "Custom domain for the web service (e.g., app.dragons.example.com)"
  type        = string
}

variable "api_domain" {
  description = "Custom domain for the API service (e.g., api.dragons.example.com)"
  type        = string
}

variable "image_tag" {
  description = "Container image tag for initial deployment"
  type        = string
  default     = "latest"
}

variable "sdk_username" {
  description = "Basketball-Bund SDK username"
  type        = string
  sensitive   = true
}

variable "sdk_password" {
  description = "Basketball-Bund SDK password"
  type        = string
  sensitive   = true
}

variable "referee_sdk_username" {
  description = "Basketball-Bund SDK username for referee assignment account"
  type        = string
  sensitive   = true
}

variable "referee_sdk_password" {
  description = "Basketball-Bund SDK password for referee assignment account"
  type        = string
  sensitive   = true
}

variable "scoreboard_device_id" {
  description = "Stramatel scoreboard panel id (Panel2Net.id). Must match the value built into the web bundle as NEXT_PUBLIC_SCOREBOARD_DEVICE_ID."
  type        = string
}

variable "log_retention_days" {
  description = "Retention for the Cloud Logging _Default bucket. Documented explicitly for GDPR transparency + DSAR handling."
  type        = number
  default     = 30
  validation {
    condition     = var.log_retention_days >= 1 && var.log_retention_days <= 3650
    error_message = "Retention must be between 1 and 3650 days."
  }
}
