terraform {
  required_version = ">= 1.6.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 6.0"
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

provider "google-beta" {
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
    "networkconnectivity.googleapis.com",
    "serviceconsumermanagement.googleapis.com",
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

resource "random_id" "db_name_suffix" {
  byte_length = 2
}

# Dedicated service accounts for Cloud Run
resource "google_service_account" "api" {
  account_id   = "dragons-api"
  display_name = "Dragons API"
}

resource "google_service_account" "web" {
  account_id   = "dragons-web"
  display_name = "Dragons Web"
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
  instance_name       = "dragons-db-production-${random_id.db_name_suffix.hex}"
  database_name       = "dragons"
  database_user       = "dragons"
  database_password   = random_password.db_password.result
  tier                = "db-f1-micro"
  environment         = "production"
  deletion_protection = true
  availability_type   = "ZONAL"
  network_id          = module.network.network_id

  depends_on = [module.network, google_project_service.apis]
}

# Grant Cloud SQL Client role for API service account
resource "google_project_iam_member" "api_cloudsql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.api.email}"

  depends_on = [google_project_service.apis]
}

# Valkey
module "valkey" {
  source = "../../modules/valkey"

  providers = {
    google-beta = google-beta
  }

  project_id  = var.project_id
  region      = var.region
  environment = "production"
  network_id  = module.network.network_id
  subnet_id   = module.network.psc_subnet_id

  depends_on = [module.network, google_project_service.apis]
}

# Secrets
module "secrets" {
  source = "../../modules/secrets"

  project_id             = var.project_id
  service_account_emails = [google_service_account.api.email]
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

  project_id      = var.project_id
  region          = var.region
  service_name    = "dragons-api-production"
  image           = "${local.artifact_registry_url}/api:${var.image_tag}"
  port            = 8080
  vpc_connector   = module.network.connector_id
  service_account = google_service_account.api.email

  cpu           = "1"
  memory        = "512Mi"
  min_instances = 1
  max_instances = 10

  env_vars = {
    NODE_ENV        = "production"
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

  cloudsql_instances = [module.database.connection_name]
  ingress            = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"

  depends_on = [module.secrets, google_project_service.apis]
}

# Cloud Run - Web
module "web" {
  source = "../../modules/cloud-run"

  project_id      = var.project_id
  region          = var.region
  service_name    = "dragons-web-production"
  image           = "${local.artifact_registry_url}/web:${var.image_tag}"
  port            = 3000
  service_account = google_service_account.web.email

  cpu           = "1"
  memory        = "512Mi"
  min_instances = 0
  max_instances = 10

  env_vars = {
    NODE_ENV            = "production"
    NEXT_PUBLIC_API_URL = "https://${var.api_domain}"
  }

  ingress = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"

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

# Grant GitHub Actions SA access to Tofu state bucket (bootstrap dependency:
# this must exist for tofu init to succeed, so it cannot be replaced by a
# project-level role that is itself managed by this Tofu config)
resource "google_storage_bucket_iam_member" "github_actions_state" {
  bucket = "dragons-tofu-state"
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${module.workload_identity.service_account_email}"
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
