variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
}

variable "environment" {
  description = "Environment (production)"
  type        = string
}

variable "shard_count" {
  description = "Number of shards"
  type        = number
  default     = 1
}

variable "replica_count" {
  description = "Number of replicas per shard"
  type        = number
  default     = 0
}

variable "node_type" {
  description = "Node type (SHARED_CORE_NANO, HIGHMEM_MEDIUM, etc.)"
  type        = string
  default     = "SHARED_CORE_NANO"
}

variable "network_id" {
  description = "VPC network ID for PSC auto-connection"
  type        = string
}

variable "subnet_id" {
  description = "Subnet ID for service connection policy"
  type        = string
}

terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 6.0"
    }
  }
}

# Service Connection Policy required for PSC auto-connections
resource "google_network_connectivity_service_connection_policy" "memorystore" {
  name          = "dragons-memorystore-scp-${var.environment}"
  location      = var.region
  service_class = "gcp-memorystore"
  network       = var.network_id

  psc_config {
    subnetworks = [var.subnet_id]
  }
}

resource "google_memorystore_instance" "valkey" {
  provider       = google-beta
  instance_id    = "dragons-valkey-${var.environment}"
  shard_count    = var.shard_count
  engine_version = "VALKEY_8_0"
  node_type      = var.node_type
  replica_count  = var.replica_count

  location                = var.region
  authorization_mode      = "AUTH_DISABLED"
  transit_encryption_mode = "TRANSIT_ENCRYPTION_DISABLED"

  engine_configs = {
    maxmemory-policy = "noeviction"
  }

  desired_auto_created_endpoints {
    network    = var.network_id
    project_id = var.project_id
  }

  depends_on = [google_network_connectivity_service_connection_policy.memorystore]
}

output "host" {
  description = "Valkey endpoint address"
  value       = google_memorystore_instance.valkey.endpoints[0].connections[0].psc_auto_connection[0].ip_address
}

output "port" {
  description = "Valkey endpoint port"
  value       = google_memorystore_instance.valkey.endpoints[0].connections[0].psc_auto_connection[0].port
}

output "connection_url" {
  description = "Redis-compatible connection URL"
  value       = "redis://${google_memorystore_instance.valkey.endpoints[0].connections[0].psc_auto_connection[0].ip_address}:${google_memorystore_instance.valkey.endpoints[0].connections[0].psc_auto_connection[0].port}"
}
