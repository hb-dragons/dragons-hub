# GCP Deployment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deploy the dragons-all monorepo to GCP using OpenTofu, Docker, and GitHub Actions.

**Architecture:** Two Cloud Run services (API + Web) behind a Global HTTPS Load Balancer with subdomain routing. Cloud SQL PostgreSQL 17 for the database, Memorystore Valkey 8.0 for BullMQ/pub-sub. Workload Identity Federation for keyless GitHub Actions auth. Automated deploy on push to main after CI passes.

**Tech Stack:** OpenTofu >= 1.6.0, Google Cloud Provider ~> 5.0, Docker (node:24-alpine), GitHub Actions, pnpm 10.30.3

**Reference project:** `/Users/jn/git/kvizme-mono-v2` — proven patterns for all modules and workflows.

---

## Task 1: Infrastructure Scaffold + Network Module

**Files:**

- Create: `infra/.gitignore`
- Create: `infra/versions.tf`
- Create: `infra/modules/network/main.tf`
- Create: `infra/modules/network/variables.tf`
- Create: `infra/modules/network/outputs.tf`

**Step 1: Create infra/.gitignore**

```gitignore
# OpenTofu / Terraform
*.tfstate
*.tfstate.*
*.tfvars
!*.tfvars.example
.terraform/
.terraform.lock.hcl
tfplan
*.tfplan
crash.log
crash.*.log
override.tf
override.tf.json
*_override.tf
*_override.tf.json

# Sensitive files
*.pem
*.key
/secrets/

# IDE
.idea/
*.swp
*.swo

# OS
.DS_Store
```

**Step 2: Create infra/versions.tf**

```hcl
terraform {
  required_version = ">= 1.6.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}
```

**Step 3: Create network module**

`infra/modules/network/variables.tf`:

```hcl
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
```

`infra/modules/network/main.tf`:

```hcl
resource "google_compute_network" "main" {
  name                    = "dragons-vpc-${var.environment}"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "connector_subnet" {
  name          = "connector-subnet-${var.environment}"
  ip_cidr_range = "10.8.0.0/28"
  region        = var.region
  network       = google_compute_network.main.id
}

resource "google_vpc_access_connector" "connector" {
  name   = "conn-${var.environment}"
  region = var.region
  subnet {
    name = google_compute_subnetwork.connector_subnet.name
  }
}

resource "google_compute_global_address" "private_ip_range" {
  name          = "private-ip-range-${var.environment}"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.main.id
}

resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.main.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_range.name]
}
```

`infra/modules/network/outputs.tf`:

```hcl
output "network_name" {
  value = google_compute_network.main.name
}

output "network_id" {
  value = google_compute_network.main.id
}

output "connector_id" {
  value = google_vpc_access_connector.connector.id
}
```

**Step 4: Commit**

```bash
git add infra/.gitignore infra/versions.tf infra/modules/network/
git commit -m "infra: scaffold and network module"
```

---

## Task 2: Data Store Modules (Cloud SQL + Valkey)

**Files:**

- Create: `infra/modules/cloud-sql/main.tf`
- Create: `infra/modules/valkey/main.tf`

**Step 1: Create Cloud SQL module**

`infra/modules/cloud-sql/main.tf`:

```hcl
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
```

**Step 2: Create Valkey module**

`infra/modules/valkey/main.tf`:

```hcl
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

resource "google_memorystore_instance" "valkey" {
  instance_id    = "dragons-valkey-${var.environment}"
  shard_count    = var.shard_count
  engine_version = "VALKEY_8_0"
  node_type      = var.node_type
  replica_count  = var.replica_count

  location                = var.region
  authorization_mode      = "AUTH_DISABLED"
  transit_encryption_mode = "TRANSIT_ENCRYPTION_DISABLED"

  desired_psc_auto_connections {
    network    = var.network_id
    project_id = var.project_id
  }
}

output "host" {
  description = "Valkey discovery endpoint address"
  value       = google_memorystore_instance.valkey.discovery_endpoints[0].address
}

output "port" {
  description = "Valkey discovery endpoint port"
  value       = google_memorystore_instance.valkey.discovery_endpoints[0].port
}

output "connection_url" {
  description = "Redis-compatible connection URL"
  value       = "redis://${google_memorystore_instance.valkey.discovery_endpoints[0].address}:${google_memorystore_instance.valkey.discovery_endpoints[0].port}"
}
```

**Step 3: Commit**

```bash
git add infra/modules/cloud-sql/ infra/modules/valkey/
git commit -m "infra: add Cloud SQL and Valkey modules"
```

---

## Task 3: Service Modules (Artifact Registry + Secrets + Cloud Run)

**Files:**

- Create: `infra/modules/artifact-registry/main.tf`
- Create: `infra/modules/secrets/main.tf`
- Create: `infra/modules/cloud-run/main.tf`

**Step 1: Create Artifact Registry module**

`infra/modules/artifact-registry/main.tf`:

```hcl
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
```

**Step 2: Create Secrets module**

`infra/modules/secrets/main.tf`:

```hcl
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
```

**Step 3: Create Cloud Run module**

`infra/modules/cloud-run/main.tf` — adapted from kvizme reference at `/Users/jn/git/kvizme-mono-v2/infra/modules/cloud-run/main.tf`:

```hcl
variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
}

variable "service_name" {
  description = "Cloud Run service name"
  type        = string
}

variable "image" {
  description = "Container image URL"
  type        = string
}

variable "port" {
  description = "Container port"
  type        = number
  default     = 8080
}

variable "cpu" {
  description = "CPU allocation"
  type        = string
  default     = "1"
}

variable "memory" {
  description = "Memory allocation"
  type        = string
  default     = "512Mi"
}

variable "min_instances" {
  description = "Minimum number of instances"
  type        = number
  default     = 0
}

variable "max_instances" {
  description = "Maximum number of instances"
  type        = number
  default     = 10
}

variable "concurrency" {
  description = "Maximum concurrent requests per instance"
  type        = number
  default     = 80
}

variable "timeout" {
  description = "Request timeout in seconds"
  type        = string
  default     = "300s"
}

variable "env_vars" {
  description = "Environment variables"
  type        = map(string)
  default     = {}
}

variable "secrets" {
  description = "Secrets from Secret Manager"
  type = map(object({
    secret_name = string
    version     = string
  }))
  default = {}
}

variable "cloudsql_instances" {
  description = "Cloud SQL instance connection names"
  type        = list(string)
  default     = []
}

variable "allow_unauthenticated" {
  description = "Allow unauthenticated access"
  type        = bool
  default     = true
}

variable "vpc_connector" {
  description = "VPC connector for private access"
  type        = string
  default     = null
}

resource "google_cloud_run_v2_service" "main" {
  name     = var.service_name
  location = var.region

  template {
    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    dynamic "vpc_access" {
      for_each = var.vpc_connector != null ? [1] : []
      content {
        connector = var.vpc_connector
        egress    = "PRIVATE_RANGES_ONLY"
      }
    }

    containers {
      image = var.image

      ports {
        container_port = var.port
      }

      resources {
        limits = {
          cpu    = var.cpu
          memory = var.memory
        }
        cpu_idle = var.min_instances > 0
      }

      dynamic "env" {
        for_each = var.env_vars
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = var.secrets
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value.secret_name
              version = env.value.version
            }
          }
        }
      }
    }

    dynamic "volumes" {
      for_each = length(var.cloudsql_instances) > 0 ? [1] : []
      content {
        name = "cloudsql"
        cloud_sql_instance {
          instances = var.cloudsql_instances
        }
      }
    }

    timeout                          = var.timeout
    max_instance_request_concurrency = var.concurrency
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
    ]
  }
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  count = var.allow_unauthenticated ? 1 : 0

  location = google_cloud_run_v2_service.main.location
  name     = google_cloud_run_v2_service.main.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

output "url" {
  description = "Cloud Run service URL"
  value       = google_cloud_run_v2_service.main.uri
}

output "service_name" {
  description = "Cloud Run service name"
  value       = google_cloud_run_v2_service.main.name
}
```

**Step 4: Commit**

```bash
git add infra/modules/artifact-registry/ infra/modules/secrets/ infra/modules/cloud-run/
git commit -m "infra: add artifact registry, secrets, and cloud run modules"
```

---

## Task 4: Routing Modules (Load Balancer + Workload Identity)

**Files:**

- Create: `infra/modules/load-balancer/main.tf`
- Create: `infra/modules/workload-identity/main.tf`

**Step 1: Create Load Balancer module**

`infra/modules/load-balancer/main.tf` — adapted from kvizme reference:

```hcl
variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "web_domain" {
  description = "Custom domain for the web service"
  type        = string
}

variable "api_domain" {
  description = "Custom domain for the API service"
  type        = string
}

variable "web_service_name" {
  description = "Cloud Run web service name"
  type        = string
}

variable "api_service_name" {
  description = "Cloud Run API service name"
  type        = string
}

resource "google_compute_global_address" "lb_ip" {
  name         = "dragons-lb-ip-${var.environment}"
  address_type = "EXTERNAL"
}

resource "google_compute_managed_ssl_certificate" "web_cert" {
  name = "dragons-web-cert-${var.environment}-${replace(var.web_domain, ".", "-")}"

  managed {
    domains = [var.web_domain]
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "google_compute_managed_ssl_certificate" "api_cert" {
  name = "dragons-api-cert-${var.environment}-${replace(var.api_domain, ".", "-")}"

  managed {
    domains = [var.api_domain]
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "google_compute_backend_service" "web_backend" {
  name                  = "dragons-web-backend-${var.environment}"
  protocol              = "HTTP"
  port_name             = "http"
  timeout_sec           = 30
  load_balancing_scheme = "EXTERNAL_MANAGED"

  backend {
    group = google_compute_region_network_endpoint_group.web_neg.id
  }
}

resource "google_compute_backend_service" "api_backend" {
  name                  = "dragons-api-backend-${var.environment}"
  protocol              = "HTTP"
  port_name             = "http"
  timeout_sec           = 300
  load_balancing_scheme = "EXTERNAL_MANAGED"

  backend {
    group = google_compute_region_network_endpoint_group.api_neg.id
  }
}

resource "google_compute_region_network_endpoint_group" "web_neg" {
  name                  = "dragons-web-neg-${var.environment}"
  network_endpoint_type = "SERVERLESS"
  region                = var.region

  cloud_run {
    service = var.web_service_name
  }
}

resource "google_compute_region_network_endpoint_group" "api_neg" {
  name                  = "dragons-api-neg-${var.environment}"
  network_endpoint_type = "SERVERLESS"
  region                = var.region

  cloud_run {
    service = var.api_service_name
  }
}

resource "google_compute_url_map" "lb_url_map" {
  name            = "dragons-url-map-${var.environment}"
  default_service = google_compute_backend_service.web_backend.id

  host_rule {
    hosts        = [var.web_domain]
    path_matcher = "web-paths"
  }

  host_rule {
    hosts        = [var.api_domain]
    path_matcher = "api-paths"
  }

  path_matcher {
    name            = "web-paths"
    default_service = google_compute_backend_service.web_backend.id
  }

  path_matcher {
    name            = "api-paths"
    default_service = google_compute_backend_service.api_backend.id
  }
}

resource "google_compute_target_https_proxy" "lb_proxy" {
  name    = "dragons-https-proxy-${var.environment}"
  url_map = google_compute_url_map.lb_url_map.id
  ssl_certificates = [
    google_compute_managed_ssl_certificate.web_cert.id,
    google_compute_managed_ssl_certificate.api_cert.id,
  ]
}

resource "google_compute_global_forwarding_rule" "lb_forwarding_rule" {
  name                  = "dragons-lb-rule-${var.environment}"
  target                = google_compute_target_https_proxy.lb_proxy.id
  port_range            = "443"
  ip_address            = google_compute_global_address.lb_ip.address
  load_balancing_scheme = "EXTERNAL_MANAGED"
}

output "load_balancer_ip" {
  description = "Load balancer IP address"
  value       = google_compute_global_address.lb_ip.address
}

output "web_domain" {
  value = var.web_domain
}

output "api_domain" {
  value = var.api_domain
}
```

**Step 2: Create Workload Identity module**

`infra/modules/workload-identity/main.tf` — adapted from kvizme reference:

```hcl
variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "project_number" {
  description = "GCP project number"
  type        = string
}

variable "github_org" {
  description = "GitHub organization or user name"
  type        = string
}

variable "github_repo" {
  description = "GitHub repository name"
  type        = string
}

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github-pool"
  display_name              = "GitHub Actions Pool"
  description               = "Identity pool for GitHub Actions"
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-provider"
  display_name                       = "GitHub Provider"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.actor"      = "assertion.actor"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }

  attribute_condition = "assertion.repository == '${var.github_org}/${var.github_repo}'"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account" "github_actions" {
  account_id   = "github-actions"
  display_name = "GitHub Actions"
  description  = "Service account for GitHub Actions CI/CD"
}

resource "google_service_account_iam_member" "workload_identity" {
  service_account_id = google_service_account.github_actions.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_org}/${var.github_repo}"
}

locals {
  github_actions_roles = [
    "roles/run.admin",
    "roles/artifactregistry.writer",
    "roles/secretmanager.secretAccessor",
    "roles/cloudsql.admin",
    "roles/compute.admin",
    "roles/iam.serviceAccountUser",
    "roles/storage.objectAdmin",
    "roles/serviceusage.serviceUsageAdmin",
    "roles/vpcaccess.admin",
    "roles/servicenetworking.networksAdmin",
  ]
}

resource "google_project_iam_member" "github_actions" {
  for_each = toset(local.github_actions_roles)

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.github_actions.email}"
}

output "workload_identity_provider" {
  description = "Workload Identity Provider resource name"
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "service_account_email" {
  description = "Service account email"
  value       = google_service_account.github_actions.email
}
```

**Step 3: Commit**

```bash
git add infra/modules/load-balancer/ infra/modules/workload-identity/
git commit -m "infra: add load balancer and workload identity modules"
```

---

## Task 5: Production Environment

**Files:**

- Create: `infra/environments/production/main.tf`
- Create: `infra/environments/production/variables.tf`
- Create: `infra/environments/production/terraform.tfvars.example`

**Step 1: Create variables.tf**

`infra/environments/production/variables.tf`:

```hcl
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
```

**Step 2: Create main.tf**

`infra/environments/production/main.tf`:

```hcl
terraform {
  required_version = ">= 1.6.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  backend "gcs" {
    bucket = "dragons-tofu-state"
    prefix = "production"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# Enable required APIs
resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "sqladmin.googleapis.com",
    "secretmanager.googleapis.com",
    "iam.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "memorystore.googleapis.com",
    "vpcaccess.googleapis.com",
    "servicenetworking.googleapis.com",
    "compute.googleapis.com",
  ])

  service            = each.key
  disable_on_destroy = false
}

# Random passwords
resource "random_password" "db_password" {
  length  = 32
  special = true
}

resource "random_password" "auth_secret" {
  length  = 64
  special = false
}

# Artifact Registry
module "artifact_registry" {
  source = "../../modules/artifact-registry"

  project_id    = var.project_id
  region        = var.region
  repository_id = "dragons"

  depends_on = [google_project_service.apis]
}

locals {
  artifact_registry_url = module.artifact_registry.repository_url
}

# Network
module "network" {
  source = "../../modules/network"

  project_id  = var.project_id
  region      = var.region
  environment = "production"

  depends_on = [google_project_service.apis]
}

# Cloud SQL
module "database" {
  source = "../../modules/cloud-sql"

  project_id          = var.project_id
  region              = var.region
  instance_name       = "dragons-db-production"
  database_name       = "dragons"
  database_user       = "dragons"
  database_password   = random_password.db_password.result
  tier                = "db-f1-micro"
  environment         = "production"
  deletion_protection = true
  availability_type   = "ZONAL"

  depends_on = [google_project_service.apis]
}

# Grant Cloud SQL Client role for Cloud Run
resource "google_project_iam_member" "cloud_run_cloudsql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${var.project_number}-compute@developer.gserviceaccount.com"

  depends_on = [google_project_service.apis]
}

# Valkey
module "valkey" {
  source = "../../modules/valkey"

  project_id  = var.project_id
  region      = var.region
  environment = "production"
  network_id  = module.network.network_id

  depends_on = [module.network, google_project_service.apis]
}

# Secrets
module "secrets" {
  source = "../../modules/secrets"

  project_id     = var.project_id
  project_number = var.project_number
  secret_names = [
    "database-url-production",
    "redis-url-production",
    "sdk-username-production",
    "sdk-password-production",
    "auth-secret-production",
  ]
  secret_values = {
    "database-url-production" = module.database.database_url
    "redis-url-production"    = module.valkey.connection_url
    "sdk-username-production" = var.sdk_username
    "sdk-password-production" = var.sdk_password
    "auth-secret-production"  = random_password.auth_secret.result
  }

  depends_on = [google_project_service.apis]
}

# Cloud Run - API
module "api" {
  source = "../../modules/cloud-run"

  project_id    = var.project_id
  region        = var.region
  service_name  = "dragons-api-production"
  image         = "${local.artifact_registry_url}/api:latest"
  port          = 8080
  vpc_connector = module.network.connector_id

  cpu           = "1"
  memory        = "512Mi"
  min_instances = 1
  max_instances = 10

  env_vars = {
    NODE_ENV        = "production"
    PORT            = "8080"
    BETTER_AUTH_URL = "https://${var.api_domain}"
    TRUSTED_ORIGINS = "https://${var.web_domain}"
    LOG_LEVEL       = "info"
  }

  secrets = {
    DATABASE_URL = {
      secret_name = "database-url-production"
      version     = "latest"
    }
    REDIS_URL = {
      secret_name = "redis-url-production"
      version     = "latest"
    }
    SDK_USERNAME = {
      secret_name = "sdk-username-production"
      version     = "latest"
    }
    SDK_PASSWORD = {
      secret_name = "sdk-password-production"
      version     = "latest"
    }
    BETTER_AUTH_SECRET = {
      secret_name = "auth-secret-production"
      version     = "latest"
    }
  }

  cloudsql_instances    = [module.database.connection_name]
  allow_unauthenticated = true

  depends_on = [module.secrets, google_project_service.apis]
}

# Cloud Run - Web
module "web" {
  source = "../../modules/cloud-run"

  project_id   = var.project_id
  region       = var.region
  service_name = "dragons-web-production"
  image        = "${local.artifact_registry_url}/web:latest"
  port         = 3000

  cpu           = "1"
  memory        = "512Mi"
  min_instances = 0
  max_instances = 10

  env_vars = {
    NODE_ENV             = "production"
    NEXT_PUBLIC_API_URL  = "https://${var.api_domain}"
  }

  allow_unauthenticated = true

  depends_on = [module.api, google_project_service.apis]
}

# Load Balancer
module "load_balancer" {
  source = "../../modules/load-balancer"

  project_id       = var.project_id
  region           = var.region
  environment      = "production"
  web_domain       = var.web_domain
  api_domain       = var.api_domain
  web_service_name = module.web.service_name
  api_service_name = module.api.service_name

  depends_on = [module.web, module.api, google_project_service.apis]
}

# Workload Identity for GitHub Actions
module "workload_identity" {
  source = "../../modules/workload-identity"

  project_id     = var.project_id
  project_number = var.project_number
  github_org     = var.github_org
  github_repo    = var.github_repo

  depends_on = [google_project_service.apis]
}

# Outputs
output "web_url" {
  value = module.web.url
}

output "api_url" {
  value = module.api.url
}

output "database_connection_name" {
  value = module.database.connection_name
}

output "artifact_registry_url" {
  value = local.artifact_registry_url
}

output "workload_identity_provider" {
  value = module.workload_identity.workload_identity_provider
}

output "github_service_account" {
  value = module.workload_identity.service_account_email
}

output "load_balancer_ip" {
  description = "Add A records for both subdomains pointing to this IP"
  value       = module.load_balancer.load_balancer_ip
}
```

**Step 3: Create terraform.tfvars.example**

`infra/environments/production/terraform.tfvars.example`:

```hcl
# Copy this file to terraform.tfvars and fill in your values
# DO NOT commit terraform.tfvars to version control

project_id     = "your-gcp-project-id"
project_number = "123456789012"
region         = "europe-west3"

# GitHub (for Workload Identity CI/CD)
github_org  = "your-github-org"
github_repo = "dragons-all"

# Custom Domains
web_domain = "app.dragons.example.com"
api_domain = "api.dragons.example.com"

# Basketball-Bund SDK credentials
sdk_username = "your-sdk-username"
sdk_password = "your-sdk-password"
```

**Step 4: Validate**

Run: `cd infra/environments/production && tofu fmt -check -recursive ../..`

**Step 5: Commit**

```bash
git add infra/environments/
git commit -m "infra: add production environment configuration"
```

---

## Task 6: API Dockerfile

**Files:**

- Create: `apps/api/tsup.config.ts`
- Modify: `apps/api/package.json` (update build script and target)
- Create: `apps/api/Dockerfile`
- Create: `.dockerignore`

**Step 1: Create tsup.config.ts**

The API's workspace dependencies (`@dragons/db`, `@dragons/sdk`, `@dragons/shared`) export raw TypeScript source. tsup must bundle them inline (not treat them as external) so the built `dist/index.js` is self-contained and runnable by plain Node.js.

`apps/api/tsup.config.ts`:

```ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node24",
  dts: true,
  clean: true,
  noExternal: [/^@dragons\//],
});
```

**Step 2: Update package.json build script**

In `apps/api/package.json`, change line 8:

- Old: `"build": "tsup src/index.ts --format esm --platform node --target node20 --dts --clean",`
- New: `"build": "tsup",`

The config file now handles all options.

**Step 3: Create .dockerignore at repo root**

`.dockerignore`:

```
node_modules
.next
dist
coverage
.git
.github
docker
infra
docs
*.md
.env*
.turbo
```

**Step 4: Create API Dockerfile**

`apps/api/Dockerfile`:

```dockerfile
FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

FROM base AS builder
WORKDIR /app

# Copy workspace files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY turbo.json tsconfig.base.json ./

# Copy packages needed by API
COPY packages/ ./packages/

# Copy API app
COPY apps/api/ ./apps/api/

# Install all dependencies (needed for build)
RUN pnpm install --frozen-lockfile

# Build API and its dependencies
ENV NODE_ENV=production
RUN pnpm turbo build --filter=@dragons/api...

# Production stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 hono

# Copy workspace files (needed for pnpm workspace resolution)
COPY --from=builder /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/package.json ./

# Copy all workspace package.json files (pnpm needs the full workspace structure)
COPY --from=builder /app/packages/db/package.json ./packages/db/package.json
COPY --from=builder /app/packages/sdk/package.json ./packages/sdk/package.json
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/packages/ui/package.json ./packages/ui/package.json

# Copy API build output
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/apps/api/dist ./apps/api/dist

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

RUN chown -R hono:nodejs /app

USER hono

EXPOSE 8080
ENV PORT=8080

CMD ["node", "apps/api/dist/index.js"]
```

**Step 5: Verify Docker build**

Run: `docker build -f apps/api/Dockerfile -t dragons-api:test .`
Expected: Successful build. The image should start without env vars (it will fail at env validation, which is expected).

**Step 6: Commit**

```bash
git add apps/api/tsup.config.ts apps/api/package.json apps/api/Dockerfile .dockerignore
git commit -m "feat: add API Dockerfile with tsup bundling config"
```

---

## Task 7: Web Dockerfile

**Files:**

- Create: `apps/web/Dockerfile`

**Step 1: Create Web Dockerfile**

Next.js standalone output is already configured in `apps/web/next.config.ts` (`output: "standalone"`). The standalone build includes a self-contained `server.js` with its own node_modules.

`apps/web/Dockerfile`:

```dockerfile
FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

FROM base AS builder
WORKDIR /app

# Copy workspace files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY turbo.json tsconfig.base.json ./

# Copy packages
COPY packages/ ./packages/

# Copy web app
COPY apps/web/ ./apps/web/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build argument: NEXT_PUBLIC_API_URL is inlined at build time
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# Build
ENV NODE_ENV=production
RUN pnpm turbo build --filter=@dragons/web...

# Production stage — no pnpm needed, standalone is self-contained
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone output (includes server.js + pruned node_modules)
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./

# Copy static files (not included in standalone by default)
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

# Copy public directory
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/web/server.js"]
```

**Step 2: Verify Docker build**

Run: `docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=http://localhost:3001 -t dragons-web:test .`
Expected: Successful build.

**Step 3: Commit**

```bash
git add apps/web/Dockerfile
git commit -m "feat: add Web Dockerfile with Next.js standalone output"
```

---

## Task 8: GitHub Actions Workflows

**Files:**

- Create: `.github/workflows/deploy.yml`
- Create: `.github/workflows/db-migrations.yml`
- Create: `.github/workflows/opentofu.yml`

**Step 1: Create deploy.yml**

`.github/workflows/deploy.yml` — adapted from kvizme reference at `/Users/jn/git/kvizme-mono-v2/.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  workflow_run:
    workflows: ["CI"]
    types: [completed]
    branches: [main]
  workflow_dispatch:
    inputs:
      services:
        description: "Services to deploy"
        required: true
        default: "all"
        type: choice
        options:
          - all
          - web
          - api

concurrency:
  group: deploy-production
  cancel-in-progress: false

jobs:
  check-ci:
    name: Check CI Status
    runs-on: ubuntu-latest
    if: github.event_name == 'workflow_dispatch' || github.event.workflow_run.conclusion == 'success'
    steps:
      - name: CI Passed
        run: echo "CI workflow passed, proceeding with deployment"

  determine-changes:
    name: Determine Changes
    runs-on: ubuntu-latest
    needs: check-ci
    outputs:
      web: ${{ steps.changes.outputs.web }}
      api: ${{ steps.changes.outputs.api }}
      db: ${{ steps.changes.outputs.db }}
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          ref: ${{ github.event.workflow_run.head_sha || github.sha }}

      - name: Check for changes
        uses: dorny/paths-filter@v3
        id: changes
        with:
          filters: |
            web:
              - 'apps/web/**'
              - 'packages/ui/**'
              - 'packages/shared/**'
            api:
              - 'apps/api/**'
              - 'packages/db/**'
              - 'packages/sdk/**'
              - 'packages/shared/**'
            db:
              - 'packages/db/src/schema/**'
              - 'packages/db/drizzle/**'

  run-migrations:
    name: Run Database Migrations
    runs-on: ubuntu-latest
    needs: determine-changes
    if: |
      needs.determine-changes.outputs.db == 'true' ||
      needs.determine-changes.outputs.api == 'true' ||
      github.event.inputs.services == 'all' ||
      github.event.inputs.services == 'api'
    environment: production
    permissions:
      contents: read
      id-token: write
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          ref: ${{ github.event.workflow_run.head_sha || github.sha }}

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10.30.3

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v3
        with:
          workload_identity_provider: ${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}
          service_account: ${{ secrets.GCP_SERVICE_ACCOUNT }}

      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v3

      - name: Setup Cloud SQL Proxy
        run: |
          curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.8.0/cloud-sql-proxy.linux.amd64
          chmod +x cloud-sql-proxy

      - name: Get Cloud SQL Instance
        id: sql
        run: |
          INSTANCE=$(gcloud sql instances list --filter="name~dragons-db-production" --format="value(connectionName)")
          echo "instance=${INSTANCE}" >> $GITHUB_OUTPUT

      - name: Start Cloud SQL Proxy
        run: |
          ./cloud-sql-proxy ${{ steps.sql.outputs.instance }} --port=5432 &
          sleep 5

      - name: Get Database Credentials
        id: creds
        run: |
          DB_URL=$(gcloud secrets versions access latest --secret="database-url-production" | sed 's|host=/cloudsql/[^&]*|host=localhost|')
          echo "::add-mask::${DB_URL}"
          echo "DATABASE_URL=${DB_URL}" >> $GITHUB_OUTPUT

      - name: Run Drizzle Migrations
        run: pnpm --filter @dragons/db db:migrate
        env:
          DATABASE_URL: ${{ steps.creds.outputs.DATABASE_URL }}

  build-web:
    name: Build & Deploy Web
    runs-on: ubuntu-latest
    needs: determine-changes
    if: |
      needs.determine-changes.outputs.web == 'true' ||
      github.event.inputs.services == 'all' ||
      github.event.inputs.services == 'web'
    environment: production
    permissions:
      contents: read
      id-token: write
    env:
      COMMIT_SHA: ${{ github.event.workflow_run.head_sha || github.sha }}
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          ref: ${{ env.COMMIT_SHA }}

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v3
        with:
          workload_identity_provider: ${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}
          service_account: ${{ secrets.GCP_SERVICE_ACCOUNT }}

      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v3

      - name: Configure Docker
        run: gcloud auth configure-docker ${{ vars.GCP_REGION }}-docker.pkg.dev

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          file: ./apps/web/Dockerfile
          push: true
          tags: |
            ${{ vars.GCP_REGION }}-docker.pkg.dev/${{ vars.GCP_PROJECT_ID }}/dragons/web:${{ env.COMMIT_SHA }}
            ${{ vars.GCP_REGION }}-docker.pkg.dev/${{ vars.GCP_PROJECT_ID }}/dragons/web:latest
          build-args: |
            NEXT_PUBLIC_API_URL=https://${{ vars.API_DOMAIN }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Deploy to Cloud Run
        run: |
          gcloud run services update dragons-web-production \
            --image=${{ vars.GCP_REGION }}-docker.pkg.dev/${{ vars.GCP_PROJECT_ID }}/dragons/web:${{ env.COMMIT_SHA }} \
            --region=${{ vars.GCP_REGION }}

  build-api:
    name: Build & Deploy API
    runs-on: ubuntu-latest
    needs: [determine-changes, run-migrations]
    if: |
      always() &&
      (needs.run-migrations.result == 'success' || needs.run-migrations.result == 'skipped') &&
      (needs.determine-changes.outputs.api == 'true' ||
      github.event.inputs.services == 'all' ||
      github.event.inputs.services == 'api')
    environment: production
    permissions:
      contents: read
      id-token: write
    env:
      COMMIT_SHA: ${{ github.event.workflow_run.head_sha || github.sha }}
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          ref: ${{ env.COMMIT_SHA }}

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v3
        with:
          workload_identity_provider: ${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}
          service_account: ${{ secrets.GCP_SERVICE_ACCOUNT }}

      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v3

      - name: Configure Docker
        run: gcloud auth configure-docker ${{ vars.GCP_REGION }}-docker.pkg.dev

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          file: ./apps/api/Dockerfile
          push: true
          tags: |
            ${{ vars.GCP_REGION }}-docker.pkg.dev/${{ vars.GCP_PROJECT_ID }}/dragons/api:${{ env.COMMIT_SHA }}
            ${{ vars.GCP_REGION }}-docker.pkg.dev/${{ vars.GCP_PROJECT_ID }}/dragons/api:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Deploy to Cloud Run
        run: |
          gcloud run services update dragons-api-production \
            --image=${{ vars.GCP_REGION }}-docker.pkg.dev/${{ vars.GCP_PROJECT_ID }}/dragons/api:${{ env.COMMIT_SHA }} \
            --region=${{ vars.GCP_REGION }}

  summary:
    name: Deployment Summary
    runs-on: ubuntu-latest
    needs: [determine-changes, run-migrations, build-web, build-api]
    if: always()
    steps:
      - name: Summary
        run: |
          echo "## Deployment Summary" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "| Service | Status |" >> $GITHUB_STEP_SUMMARY
          echo "|---------|--------|" >> $GITHUB_STEP_SUMMARY
          echo "| Migrations | ${{ needs.run-migrations.result }} |" >> $GITHUB_STEP_SUMMARY
          echo "| Web | ${{ needs.build-web.result }} |" >> $GITHUB_STEP_SUMMARY
          echo "| API | ${{ needs.build-api.result }} |" >> $GITHUB_STEP_SUMMARY
```

**Step 2: Create db-migrations.yml**

`.github/workflows/db-migrations.yml` — adapted from kvizme reference:

```yaml
name: Database Migrations

on:
  workflow_dispatch:
    inputs:
      action:
        description: "Migration action"
        required: true
        default: "migrate"
        type: choice
        options:
          - migrate
          - push
          - check

concurrency:
  group: migrations-production
  cancel-in-progress: false

jobs:
  migrate:
    name: Run Migration
    runs-on: ubuntu-latest
    environment: production
    permissions:
      contents: read
      id-token: write
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10.30.3

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v3
        with:
          workload_identity_provider: ${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}
          service_account: ${{ secrets.GCP_SERVICE_ACCOUNT }}

      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v3

      - name: Setup Cloud SQL Proxy
        run: |
          curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.8.0/cloud-sql-proxy.linux.amd64
          chmod +x cloud-sql-proxy

      - name: Get Cloud SQL Instance
        id: sql
        run: |
          INSTANCE=$(gcloud sql instances list --filter="name~dragons-db-production" --format="value(connectionName)")
          echo "instance=${INSTANCE}" >> $GITHUB_OUTPUT

      - name: Start Cloud SQL Proxy
        run: |
          ./cloud-sql-proxy ${{ steps.sql.outputs.instance }} --port=5432 &
          sleep 5

      - name: Get Database Credentials
        id: creds
        run: |
          DB_URL=$(gcloud secrets versions access latest --secret="database-url-production" | sed 's|host=/cloudsql/[^&]*|host=localhost|')
          echo "::add-mask::${DB_URL}"
          echo "DATABASE_URL=${DB_URL}" >> $GITHUB_OUTPUT

      - name: Apply Migrations
        if: github.event.inputs.action == 'migrate'
        run: pnpm --filter @dragons/db db:migrate
        env:
          DATABASE_URL: ${{ steps.creds.outputs.DATABASE_URL }}

      - name: Push Schema
        if: github.event.inputs.action == 'push'
        run: pnpm --filter @dragons/db db:push
        env:
          DATABASE_URL: ${{ steps.creds.outputs.DATABASE_URL }}

      - name: Check Schema
        if: github.event.inputs.action == 'check'
        run: |
          cd packages/db
          pnpm drizzle-kit check
        env:
          DATABASE_URL: ${{ steps.creds.outputs.DATABASE_URL }}

      - name: Summary
        run: |
          echo "## Database Migration" >> $GITHUB_STEP_SUMMARY
          echo "**Action:** ${{ github.event.inputs.action }}" >> $GITHUB_STEP_SUMMARY
          echo "**Status:** Completed" >> $GITHUB_STEP_SUMMARY
```

**Step 3: Create opentofu.yml**

`.github/workflows/opentofu.yml` — adapted from kvizme reference. Since we only have production, this is simpler:

```yaml
name: Infrastructure (OpenTofu)

on:
  push:
    branches: [main]
    paths:
      - "infra/**"
      - ".github/workflows/opentofu.yml"
  pull_request:
    branches: [main]
    paths:
      - "infra/**"
      - ".github/workflows/opentofu.yml"
  workflow_dispatch:
    inputs:
      action:
        description: "Action to perform"
        required: true
        default: "plan"
        type: choice
        options:
          - plan
          - apply

concurrency:
  group: ${{ github.workflow }}
  cancel-in-progress: false

env:
  TOFU_VERSION: "1.6.0"

jobs:
  validate:
    name: Validate
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup OpenTofu
        uses: opentofu/setup-opentofu@v1
        with:
          tofu_version: ${{ env.TOFU_VERSION }}

      - name: Format Check
        run: tofu fmt -check -recursive
        working-directory: infra

  plan:
    name: Plan
    runs-on: ubuntu-latest
    needs: validate
    environment: production
    permissions:
      contents: read
      id-token: write
      pull-requests: write
    defaults:
      run:
        working-directory: infra/environments/production
    env:
      TF_VAR_project_id: ${{ vars.GCP_PROJECT_ID }}
      TF_VAR_project_number: ${{ vars.GCP_PROJECT_NUMBER }}
      TF_VAR_region: ${{ vars.GCP_REGION }}
      TF_VAR_github_org: ${{ github.repository_owner }}
      TF_VAR_github_repo: ${{ github.event.repository.name }}
      TF_VAR_web_domain: ${{ vars.WEB_DOMAIN }}
      TF_VAR_api_domain: ${{ vars.API_DOMAIN }}
      TF_VAR_sdk_username: ${{ secrets.SDK_USERNAME }}
      TF_VAR_sdk_password: ${{ secrets.SDK_PASSWORD }}
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v3
        with:
          workload_identity_provider: ${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}
          service_account: ${{ secrets.GCP_SERVICE_ACCOUNT }}

      - name: Setup OpenTofu
        uses: opentofu/setup-opentofu@v1
        with:
          tofu_version: ${{ env.TOFU_VERSION }}

      - name: Initialize
        run: tofu init

      - name: Validate
        run: tofu validate

      - name: Plan
        id: plan
        run: tofu plan -input=false -out=tfplan -no-color 2>&1 | tee plan_output.txt
        continue-on-error: true

      - name: Comment Plan on PR
        uses: actions/github-script@v7
        if: github.event_name == 'pull_request'
        with:
          script: |
            const fs = require('fs');
            const planOutput = fs.readFileSync('infra/environments/production/plan_output.txt', 'utf8');
            const truncated = planOutput.length > 60000
              ? planOutput.substring(0, 60000) + '\n\n... (truncated)'
              : planOutput;
            const body = `## OpenTofu Plan\n\n<details>\n<summary>Show Plan Output</summary>\n\n\`\`\`hcl\n${truncated}\n\`\`\`\n\n</details>\n\n**Status:** ${{ steps.plan.outcome }}`;
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: body
            });

      - name: Upload Plan
        uses: actions/upload-artifact@v4
        with:
          name: tfplan-production
          path: infra/environments/production/tfplan
          retention-days: 7

      - name: Plan Status
        if: steps.plan.outcome == 'failure'
        run: exit 1

  apply:
    name: Apply
    runs-on: ubuntu-latest
    needs: plan
    if: |
      (github.event_name == 'push' && github.ref == 'refs/heads/main') ||
      (github.event_name == 'workflow_dispatch' && github.event.inputs.action == 'apply')
    environment: production
    permissions:
      contents: read
      id-token: write
    defaults:
      run:
        working-directory: infra/environments/production
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v3
        with:
          workload_identity_provider: ${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}
          service_account: ${{ secrets.GCP_SERVICE_ACCOUNT }}

      - name: Setup OpenTofu
        uses: opentofu/setup-opentofu@v1
        with:
          tofu_version: ${{ env.TOFU_VERSION }}

      - name: Download Plan
        uses: actions/download-artifact@v4
        with:
          name: tfplan-production
          path: infra/environments/production

      - name: Initialize
        run: tofu init

      - name: Apply
        run: tofu apply -auto-approve tfplan

      - name: Summary
        run: |
          echo "## Infrastructure Applied" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          tofu output -json | jq -r 'to_entries[] | "- **\(.key):** \(.value.value)"' >> $GITHUB_STEP_SUMMARY
```

**Step 4: Commit**

```bash
git add .github/workflows/deploy.yml .github/workflows/db-migrations.yml .github/workflows/opentofu.yml
git commit -m "ci: add deploy, migrations, and opentofu workflows"
```

---

## Task 9: Verification and Final Commit

**Step 1: Update CI/CD Node.js version**

In `.github/workflows/ci.yml` and `.github/workflows/cd.yml`, update all `node-version: 20` to `node-version: 24`.

**Step 2: Validate OpenTofu formatting**

Run: `cd infra && tofu fmt -recursive`

If any files are reformatted, stage and note the changes.

**Step 3: Verify API Docker build**

Run: `docker build -f apps/api/Dockerfile -t dragons-api:test .`
Expected: Build succeeds. Image runs but fails on env validation (expected without DATABASE_URL etc.).

**Step 4: Verify Web Docker build**

Run: `docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=http://localhost:3001 -t dragons-web:test .`
Expected: Build succeeds.

**Step 5: Run existing tests**

Run: `pnpm test`
Expected: All tests pass (the tsup.config.ts change should not break existing tests).

**Step 6: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors.

**Step 7: Final commit**

```bash
git add -A
git commit -m "chore: update Node.js to 24 in CI/CD, format infra files"
```

---

## Post-Implementation: Manual Setup Checklist

After all code is committed and pushed, complete these manual steps:

1. **Create GCP project** — note the project ID and project number
2. **Create GCS state bucket** — `gsutil mb -l europe-west3 gs://<project-id>-tofu-state`
3. **Update backend bucket name** — edit `infra/environments/production/main.tf` line 18 to match your bucket
4. **Copy tfvars** — `cp infra/environments/production/terraform.tfvars.example infra/environments/production/terraform.tfvars` and fill in values
5. **First tofu apply** — `cd infra/environments/production && tofu init && tofu plan && tofu apply`
6. **Note outputs** — `tofu output workload_identity_provider` and `tofu output github_service_account`
7. **Configure GitHub** — Add secrets (`GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT`, `SDK_USERNAME`, `SDK_PASSWORD`) and variables (`GCP_PROJECT_ID`, `GCP_PROJECT_NUMBER`, `GCP_REGION`, `WEB_DOMAIN`, `API_DOMAIN`) to the `production` environment in GitHub repo settings
8. **DNS** — Add A records for both subdomains pointing to `tofu output load_balancer_ip`
9. **Wait for SSL** — Google-managed certificates provision automatically (up to 24 hours)
10. **First deploy** — Push to main or manually trigger the Deploy workflow
