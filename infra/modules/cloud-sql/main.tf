variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
}

variable "instance_name" {
  description = "Cloud SQL instance name"
  type        = string
}

variable "database_name" {
  description = "Database name"
  type        = string
  default     = "dragons"
}

variable "database_user" {
  description = "Database user name"
  type        = string
  default     = "dragons"
}

variable "database_password" {
  description = "Database password"
  type        = string
  sensitive   = true
}

variable "tier" {
  description = "Cloud SQL machine tier"
  type        = string
  default     = "db-f1-micro"
}

variable "environment" {
  description = "Environment (production)"
  type        = string
}

variable "deletion_protection" {
  description = "Enable deletion protection"
  type        = bool
  default     = true
}

variable "availability_type" {
  description = "Availability type (ZONAL or REGIONAL)"
  type        = string
  default     = "ZONAL"
}

resource "google_sql_database_instance" "main" {
  name                = var.instance_name
  database_version    = "POSTGRES_17"
  region              = var.region
  deletion_protection = var.deletion_protection

  settings {
    tier              = var.tier
    edition           = "ENTERPRISE"
    availability_type = var.availability_type
    disk_autoresize   = true
    disk_size         = 10
    disk_type         = "PD_SSD"

    backup_configuration {
      enabled                        = true
      start_time                     = "03:00"
      point_in_time_recovery_enabled = true
      transaction_log_retention_days = 7

      backup_retention_settings {
        retained_backups = 30
      }
    }

    maintenance_window {
      day          = 7
      hour         = 3
      update_track = "stable"
    }

    insights_config {
      query_insights_enabled  = true
      record_application_tags = true
      record_client_address   = true
    }

    ip_configuration {
      ipv4_enabled = true
    }

    database_flags {
      name  = "max_connections"
      value = "100"
    }
  }
}

resource "google_sql_database" "database" {
  name     = var.database_name
  instance = google_sql_database_instance.main.name
}

resource "google_sql_user" "user" {
  name     = var.database_user
  instance = google_sql_database_instance.main.name
  password = var.database_password
}

output "connection_name" {
  description = "Cloud SQL connection name for Cloud Run"
  value       = google_sql_database_instance.main.connection_name
}

output "instance_name" {
  description = "Cloud SQL instance name"
  value       = google_sql_database_instance.main.name
}

output "database_url" {
  description = "Database connection URL (Unix socket for Cloud Run)"
  value       = "postgresql://${var.database_user}:${urlencode(var.database_password)}@/${var.database_name}?host=/cloudsql/${google_sql_database_instance.main.connection_name}"
  sensitive   = true
}

output "public_ip" {
  description = "Public IP address"
  value       = google_sql_database_instance.main.public_ip_address
}
