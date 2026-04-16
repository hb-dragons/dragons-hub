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

resource "random_password" "turbo_token" {
  length  = 48
  special = false
}

resource "random_password" "turbo_signature_key" {
  length  = 48
  special = false
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

resource "google_service_account" "turbo_cache" {
  account_id   = "dragons-turbo-cache"
  display_name = "Dragons Turbo Cache"
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
    "referee-sdk-username-production",
    "referee-sdk-password-production",
    "auth-secret-production",
  ]
  secret_values = {
    "database-url-production"         = module.database.database_url
    "redis-url-production"            = module.valkey.connection_url
    "sdk-username-production"         = var.sdk_username
    "sdk-password-production"         = var.sdk_password
    "referee-sdk-username-production" = var.referee_sdk_username
    "referee-sdk-password-production" = var.referee_sdk_password
    "auth-secret-production"          = random_password.auth_secret.result
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

  cpu_idle = true

  env_vars = {
    NODE_ENV        = "production"
    RUN_MODE        = "api"
    BETTER_AUTH_URL = "https://${var.api_domain}"
    TRUSTED_ORIGINS = "https://${var.web_domain}"
    LOG_LEVEL       = "info"
    GCS_BUCKET_NAME = google_storage_bucket.social_assets.name
    GCS_PROJECT_ID  = var.project_id
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
    REFEREE_SDK_USERNAME = {
      secret_name = "referee-sdk-username-production"
      version     = "latest"
    }
    REFEREE_SDK_PASSWORD = {
      secret_name = "referee-sdk-password-production"
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

# Cloud Run - Worker (same image as API, dedicated CPU for background jobs)
module "worker" {
  source = "../../modules/cloud-run"

  project_id      = var.project_id
  region          = var.region
  service_name    = "dragons-worker-production"
  image           = "${local.artifact_registry_url}/api:${var.image_tag}"
  port            = 8080
  vpc_connector   = module.network.connector_id
  service_account = google_service_account.api.email

  cpu           = "1"
  memory        = "512Mi"
  min_instances = 1
  max_instances = 1
  cpu_idle      = false
  concurrency   = 1
  timeout       = "900s"

  env_vars = {
    NODE_ENV        = "production"
    RUN_MODE        = "worker"
    BETTER_AUTH_URL = "https://${var.api_domain}"
    TRUSTED_ORIGINS = "https://${var.web_domain}"
    LOG_LEVEL       = "info"
    GCS_BUCKET_NAME = google_storage_bucket.social_assets.name
    GCS_PROJECT_ID  = var.project_id
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
    REFEREE_SDK_USERNAME = {
      secret_name = "referee-sdk-username-production"
      version     = "latest"
    }
    REFEREE_SDK_PASSWORD = {
      secret_name = "referee-sdk-password-production"
      version     = "latest"
    }
    BETTER_AUTH_SECRET = {
      secret_name = "auth-secret-production"
      version     = "latest"
    }
  }

  cloudsql_instances = [module.database.connection_name]
  ingress            = "INGRESS_TRAFFIC_ALL"

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

# NOTE: The GitHub Actions SA needs roles/storage.objectAdmin on the
# dragons-tofu-state bucket for tofu init to work. This is a bootstrap
# dependency that must be granted manually (via gcloud) since Tofu cannot
# manage a permission it needs to run.

# Workload Identity for GitHub Actions
module "workload_identity" {
  source = "../../modules/workload-identity"

  project_id     = var.project_id
  project_number = var.project_number
  github_org     = var.github_org
  github_repo    = var.github_repo

  depends_on = [google_project_service.apis]
}

# Social Assets - GCS bucket for player photos, backgrounds, fonts
resource "google_storage_bucket" "social_assets" {
  name                        = "${var.project_id}-social-assets"
  location                    = var.region
  project                     = var.project_id
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  depends_on = [google_project_service.apis]
}

resource "google_storage_bucket_iam_member" "social_assets_api" {
  bucket = google_storage_bucket.social_assets.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.api.email}"
}

# Turbo Remote Cache - GCS bucket for build artifacts
resource "google_storage_bucket" "turbo_cache" {
  name                        = "${var.project_id}-turbo-cache"
  location                    = var.region
  project                     = var.project_id
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  lifecycle_rule {
    condition {
      age = 30
    }
    action {
      type = "Delete"
    }
  }

  depends_on = [google_project_service.apis]
}

resource "google_storage_bucket_iam_member" "turbo_cache_storage" {
  bucket = google_storage_bucket.turbo_cache.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.turbo_cache.email}"
}

# Turbo Remote Cache - Secrets
resource "google_secret_manager_secret" "turbo_token" {
  secret_id = "turbo-token-production"
  project   = var.project_id

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "turbo_token" {
  secret      = google_secret_manager_secret.turbo_token.id
  secret_data = random_password.turbo_token.result
}

resource "google_secret_manager_secret" "turbo_signature_key" {
  secret_id = "turbo-signature-key-production"
  project   = var.project_id

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "turbo_signature_key" {
  secret      = google_secret_manager_secret.turbo_signature_key.id
  secret_data = random_password.turbo_signature_key.result
}

resource "google_secret_manager_secret_iam_member" "turbo_cache_token_access" {
  secret_id = google_secret_manager_secret.turbo_token.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.turbo_cache.email}"
  project   = var.project_id
}

resource "google_secret_manager_secret_iam_member" "turbo_cache_signature_key_access" {
  secret_id = google_secret_manager_secret.turbo_signature_key.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.turbo_cache.email}"
  project   = var.project_id
}

# Grant GitHub Actions SA access to read turbo secrets (for CI env vars)
resource "google_secret_manager_secret_iam_member" "github_turbo_token_access" {
  secret_id = google_secret_manager_secret.turbo_token.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${module.workload_identity.service_account_email}"
  project   = var.project_id
}

resource "google_secret_manager_secret_iam_member" "github_turbo_signature_key_access" {
  secret_id = google_secret_manager_secret.turbo_signature_key.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${module.workload_identity.service_account_email}"
  project   = var.project_id
}

# Turbo Remote Cache - Cloud Run service
module "turbo_cache" {
  source = "../../modules/cloud-run"

  project_id      = var.project_id
  region          = var.region
  service_name    = "dragons-turbo-cache-production"
  image           = "ducktors/turborepo-remote-cache:latest"
  port            = 3000
  service_account = google_service_account.turbo_cache.email

  cpu           = "1"
  memory        = "512Mi"
  min_instances = 0
  max_instances = 2
  cpu_idle      = true
  timeout       = "60s"

  allow_unauthenticated = false
  ingress               = "INGRESS_TRAFFIC_ALL"

  env_vars = {
    NODE_ENV         = "production"
    STORAGE_PROVIDER = "google-cloud-storage"
    STORAGE_PATH     = google_storage_bucket.turbo_cache.name
    LOG_LEVEL        = "info"
  }

  secrets = {
    TURBO_TOKEN = {
      secret_name = google_secret_manager_secret.turbo_token.secret_id
      version     = "latest"
    }
    TURBO_REMOTE_CACHE_SIGNATURE_KEY = {
      secret_name = google_secret_manager_secret.turbo_signature_key.secret_id
      version     = "latest"
    }
  }

  depends_on = [
    google_project_service.apis,
    google_secret_manager_secret_version.turbo_token,
    google_secret_manager_secret_version.turbo_signature_key,
    google_secret_manager_secret_iam_member.turbo_cache_token_access,
    google_secret_manager_secret_iam_member.turbo_cache_signature_key_access,
  ]
}

# Grant GitHub Actions SA permission to invoke the turbo cache service
resource "google_cloud_run_v2_service_iam_member" "turbo_cache_github_invoker" {
  location = var.region
  name     = module.turbo_cache.service_name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${module.workload_identity.service_account_email}"
}

# Outputs
output "web_url" {
  value = module.web.url
}

output "api_url" {
  value = module.api.url
}

output "worker_url" {
  value = module.worker.url
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

output "social_assets_bucket" {
  description = "GCS bucket for social media assets (player photos, backgrounds, fonts)"
  value       = google_storage_bucket.social_assets.name
}

output "turbo_cache_url" {
  description = "Turbo remote cache URL (set as TURBO_API in GitHub Actions)"
  value       = module.turbo_cache.url
}
