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
  default     = "dragons-all"
}

variable "web_domain" {
  description = "Custom domain for the web service (e.g., app.dragons.example.com)"
  type        = string
}

variable "api_domain" {
  description = "Custom domain for the API service (e.g., api.dragons.example.com)"
  type        = string
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
