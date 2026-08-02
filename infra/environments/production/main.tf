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

# Cloud Logging retention for the _Default log bucket.
#
# Under GDPR, operational logs that can still identify users (e.g. via an
# incident trail) need a documented retention period. Thirty days is enough
# for debugging + incident response but short enough to defend under a DSAR.
#
# The _Default bucket is created automatically by the platform; this resource
# reconfigures it rather than creating a new one. `locked = false` keeps the
# door open for shortening the window later without a support ticket.
resource "google_logging_project_bucket_config" "default" {
  project        = var.project_id
  location       = "global"
  bucket_id      = "_Default"
  retention_days = var.log_retention_days
  description    = "Default log bucket. Retention is bounded for GDPR compliance."
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

# Bearer token the Raspberry Pi includes when posting raw Stramatel frames to
# /api/scoreboard/ingest. Validated by SCOREBOARD_INGEST_KEY in env.ts.
resource "random_password" "scoreboard_ingest_key" {
  length  = 48
  special = false
}

# Payload's cookie/token signing secret (PAYLOAD_SECRET on the cms service).
resource "random_password" "payload_secret" {
  length  = 64
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

resource "google_service_account" "cms" {
  account_id   = "dragons-cms"
  display_name = "Dragons CMS"
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

  # Expo Push access token: a credential, so Secret Manager, never env_vars.
  # Optional — without it push still works, just on the unauthenticated tier —
  # so the secret is omitted rather than created empty (Secret Manager rejects
  # an empty payload, and the API env schema rejects "" for EXPO_ACCESS_TOKEN).
  expo_access_token_enabled = var.expo_access_token != ""

  # Email delivery. `smtp_host` is the single switch for the whole set: the API
  # env schema requires all five SMTP_* vars together (readSmtpSettings() treats
  # a partial set as "not configured") and rejects "" for each of them, so the
  # keys are omitted entirely rather than passed through empty — the same
  # precedent as WAHA_BASE_URL above.
  smtp_enabled = var.smtp_host != ""

  smtp_env_vars = local.smtp_enabled ? {
    SMTP_HOST = var.smtp_host
    SMTP_PORT = tostring(var.smtp_port)
    SMTP_USER = var.smtp_user
    SMTP_FROM = var.smtp_from
  } : {}

  # Only the password is a credential; the rest are relay coordinates.
  smtp_secrets = local.smtp_enabled ? {
    SMTP_PASSWORD = {
      secret_name = "smtp-password-production"
      version     = "latest"
    }
  } : {}

  # Payload's public origins (CMS_PUBLIC_URL): first entry becomes serverURL,
  # all entries are trusted for CORS/CSRF. The deterministic run.app URL is
  # always included so the admin panel works before DNS exists and keeps
  # working beside the LB domain. Domain changes at cutover are a var change +
  # redeploy — no code involved.
  cms_run_url        = "https://dragons-cms-production-${var.project_number}.${var.region}.run.app"
  cms_public_origins = concat([for domain in var.cms_domains : "https://${domain}"], [local.cms_run_url])
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

# Payload's database, on the same instance as the app db. Same instance user
# (`dragons`): the instance is single-tenant and the cloud-sql module owns
# that user, so DATABASE_URL_CMS below reuses its password.
resource "google_sql_database" "cms" {
  name     = "dragons_cms"
  instance = module.database.instance_name
}

resource "google_project_iam_member" "cms_cloudsql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.cms.email}"

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
  secret_names = concat([
    "database-url-production",
    "redis-url-production",
    "sdk-username-production",
    "sdk-password-production",
    "referee-sdk-username-production",
    "referee-sdk-password-production",
    "auth-secret-production",
    "scoreboard-ingest-key-production",
    "google-generative-ai-api-key-production",
    "mcp-token-production",
    ], local.expo_access_token_enabled ? ["expo-access-token-production"] : [],
  local.smtp_enabled ? ["smtp-password-production"] : [])
  secret_values = merge({
    "database-url-production"                 = module.database.database_url
    "redis-url-production"                    = module.valkey.connection_url
    "sdk-username-production"                 = var.sdk_username
    "sdk-password-production"                 = var.sdk_password
    "referee-sdk-username-production"         = var.referee_sdk_username
    "referee-sdk-password-production"         = var.referee_sdk_password
    "auth-secret-production"                  = random_password.auth_secret.result
    "scoreboard-ingest-key-production"        = random_password.scoreboard_ingest_key.result
    "google-generative-ai-api-key-production" = var.google_generative_ai_api_key
    "mcp-token-production"                    = var.mcp_token
    }, local.expo_access_token_enabled ? {
    "expo-access-token-production" = var.expo_access_token
    } : {}, local.smtp_enabled ? {
    "smtp-password-production" = var.smtp_password
  } : {})

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

  env_vars = merge({
    NODE_ENV        = "production"
    RUN_MODE        = "api"
    BETTER_AUTH_URL = "https://${var.api_domain}"
    # First origin doubles as the public URL in notification links (TRUSTED_ORIGINS[0]) — keep web_domain first.
    TRUSTED_ORIGINS = "https://${var.web_domain},https://hbdragons.de,https://www.hbdragons.de,https://site.testing.hbdragons.de"
    LOG_LEVEL       = "info"
    GCS_BUCKET_NAME = google_storage_bucket.social_assets.name
    GCS_PROJECT_ID  = var.project_id
    # Logging / Cloud Logging + Trace correlation.
    # SERVICE_VERSION is left unset; the logger falls back to K_REVISION,
    # which Cloud Run updates automatically on every revision.
    SERVICE_NAME         = "api"
    GCP_PROJECT_ID       = var.project_id
    SCOREBOARD_DEVICE_ID = var.scoreboard_device_id
    CHATBOT_ENABLED      = var.chatbot_enabled
    CHATBOT_MODEL        = var.chatbot_model
    ASSISTANT_ENABLED    = var.assistant_enabled
    ASSISTANT_MODEL      = var.assistant_model
    # WhatsApp group delivery. The API dispatches through the same pipeline as
    # the Worker via the admin "retry failed notification" route, so it needs
    # these too. Omitted entirely when unset: env.ts validates WAHA_BASE_URL as
    # a URL and `.optional()` does not accept "", so an empty passthrough would
    # fail the service at boot rather than just disable the channel.
    }, var.waha_base_url == "" ? {} : {
    WAHA_BASE_URL = var.waha_base_url
    WAHA_SESSION  = var.waha_session
    # Email delivery. The API needs these for the same reason it needs WAHA:
    # the admin test-send and "retry failed notification" routes dispatch
    # through the same pipeline. Gated as one set on smtp_host — see locals.
  }, local.smtp_env_vars)

  secrets = merge({
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
    SCOREBOARD_INGEST_KEY = {
      secret_name = "scoreboard-ingest-key-production"
      version     = "latest"
    }
    GOOGLE_GENERATIVE_AI_API_KEY = {
      secret_name = "google-generative-ai-api-key-production"
      version     = "latest"
    }
    MCP_TOKEN = {
      secret_name = "mcp-token-production"
      version     = "latest"
    }
    }, local.expo_access_token_enabled ? {
    EXPO_ACCESS_TOKEN = {
      secret_name = "expo-access-token-production"
      version     = "latest"
    }
  } : {}, local.smtp_secrets)

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

  env_vars = merge({
    NODE_ENV        = "production"
    RUN_MODE        = "worker"
    BETTER_AUTH_URL = "https://${var.api_domain}"
    # First origin doubles as the public URL in notification links (TRUSTED_ORIGINS[0]) — keep web_domain first.
    TRUSTED_ORIGINS = "https://${var.web_domain},https://hbdragons.de,https://www.hbdragons.de,https://site.testing.hbdragons.de"
    LOG_LEVEL       = "info"
    GCS_BUCKET_NAME = google_storage_bucket.social_assets.name
    GCS_PROJECT_ID  = var.project_id
    # Logging / Cloud Logging + Trace correlation.
    # SERVICE_NAME differs from the API so logs are filterable per workload.
    SERVICE_NAME         = "worker"
    GCP_PROJECT_ID       = var.project_id
    SCOREBOARD_DEVICE_ID = var.scoreboard_device_id
    CHATBOT_ENABLED      = var.chatbot_enabled
    CHATBOT_MODEL        = var.chatbot_model
    ASSISTANT_ENABLED    = var.assistant_enabled
    ASSISTANT_MODEL      = var.assistant_model
    # WhatsApp group delivery. This is the service that runs the event worker,
    # so without these every WhatsApp notification logs "not configured,
    # skipping" and is dropped. See the API block for why "" is not passed.
    }, var.waha_base_url == "" ? {} : {
    WAHA_BASE_URL = var.waha_base_url
    WAHA_SESSION  = var.waha_session
    # Email delivery. This is the service that runs the event worker, so without
    # these every email notification logs "SMTP is not configured" and is
    # dropped. Gated as one set on smtp_host — see locals.
  }, local.smtp_env_vars)

  secrets = merge({
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
    SCOREBOARD_INGEST_KEY = {
      secret_name = "scoreboard-ingest-key-production"
      version     = "latest"
    }
    GOOGLE_GENERATIVE_AI_API_KEY = {
      secret_name = "google-generative-ai-api-key-production"
      version     = "latest"
    }
    }, local.expo_access_token_enabled ? {
    EXPO_ACCESS_TOKEN = {
      secret_name = "expo-access-token-production"
      version     = "latest"
    }
  } : {}, local.smtp_secrets)

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

# CMS media — GCS bucket for Payload's media collection. Publicly readable by
# design: `disablePayloadAccessControl` in payload.config.ts rewrites media
# URLs to point straight at storage.googleapis.com, so the static site never
# proxies images through the scale-to-zero cms service. Hence no
# `public_access_prevention = "enforced"` (unlike social_assets) and an
# allUsers objectViewer grant — this bucket must never hold anything that is
# not public site content.
resource "google_storage_bucket" "cms_media" {
  name                        = "${var.project_id}-cms-media"
  location                    = var.region
  project                     = var.project_id
  uniform_bucket_level_access = true
  public_access_prevention    = "inherited"

  depends_on = [google_project_service.apis]
}

resource "google_storage_bucket_iam_member" "cms_media_cms" {
  bucket = google_storage_bucket.cms_media.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.cms.email}"
}

resource "google_storage_bucket_iam_member" "cms_media_public_read" {
  bucket = google_storage_bucket.cms_media.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

# CMS secrets. Standalone resources (turbo-cache pattern) rather than the
# shared secrets module: that module grants every listed service account
# access to every secret, and the cms service account must not read api
# credentials (nor vice versa).
resource "google_secret_manager_secret" "cms_database_url" {
  secret_id = "database-url-cms-production"
  project   = var.project_id

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "cms_database_url" {
  secret = google_secret_manager_secret.cms_database_url.id
  # Same shape as the cloud-sql module's database_url output (user `dragons`,
  # whose password the module owns), pointed at the dragons_cms database on
  # the same instance.
  secret_data = "postgresql://dragons:${urlencode(random_password.db_password.result)}@/${google_sql_database.cms.name}?host=/cloudsql/${module.database.connection_name}"
}

resource "google_secret_manager_secret" "payload_secret" {
  secret_id = "payload-secret-production"
  project   = var.project_id

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "payload_secret" {
  secret      = google_secret_manager_secret.payload_secret.id
  secret_data = random_password.payload_secret.result
}

# Fine-grained PAT for the publish → site-rebuild repository_dispatch. The
# real value is added manually post-apply:
#   echo -n "<pat>" | gcloud secrets versions add gh-dispatch-token-production --data-file=-
# Tofu only guarantees a resolvable "latest" so the cms revision can mount the
# secret from the very first apply. The placeholder is not a credential:
# GitHub rejects it and the dispatch hook (apps/cms/src/hooks/dispatch-rebuild.ts)
# logs and swallows the failure, so publishes still save. ignore_changes keeps
# an apply from ever adding a new version on top of the manually added token.
resource "google_secret_manager_secret" "gh_dispatch_token" {
  secret_id = "gh-dispatch-token-production"
  project   = var.project_id

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "gh_dispatch_token_placeholder" {
  secret      = google_secret_manager_secret.gh_dispatch_token.id
  secret_data = "placeholder-add-real-token-via-gcloud"

  lifecycle {
    ignore_changes = [secret_data]
  }
}

resource "google_secret_manager_secret_iam_member" "cms_database_url_access" {
  secret_id = google_secret_manager_secret.cms_database_url.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cms.email}"
  project   = var.project_id
}

resource "google_secret_manager_secret_iam_member" "payload_secret_access" {
  secret_id = google_secret_manager_secret.payload_secret.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cms.email}"
  project   = var.project_id
}

resource "google_secret_manager_secret_iam_member" "gh_dispatch_token_access" {
  secret_id = google_secret_manager_secret.gh_dispatch_token.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cms.email}"
  project   = var.project_id
}

# Cloud Run - CMS (Payload admin + REST for site builds; scale-to-zero)
module "cms" {
  source = "../../modules/cloud-run"

  project_id      = var.project_id
  region          = var.region
  service_name    = "dragons-cms-production"
  image           = "${local.artifact_registry_url}/cms:${var.image_tag}"
  port            = 3000
  service_account = google_service_account.cms.email

  cpu = "1"
  # 1Gi where web runs 512Mi: sharp decodes uploads in-process (blurhash +
  # resize) and the Payload admin server needs the headroom.
  memory        = "1Gi"
  min_instances = 0
  max_instances = 2

  env_vars = {
    NODE_ENV         = "production"
    GCS_MEDIA_BUCKET = google_storage_bucket.cms_media.name
    CMS_PUBLIC_URL   = join(",", local.cms_public_origins)
  }

  secrets = {
    DATABASE_URL_CMS = {
      secret_name = "database-url-cms-production"
      version     = "latest"
    }
    PAYLOAD_SECRET = {
      secret_name = "payload-secret-production"
      version     = "latest"
    }
    GH_DISPATCH_TOKEN = {
      secret_name = "gh-dispatch-token-production"
      version     = "latest"
    }
  }

  cloudsql_instances = [module.database.connection_name]

  # Reachable on the bare run.app URL (the admin must work before DNS and the
  # LB cert exist) and through the LB host rule. Auth is Payload's own: admin
  # sessions and API keys.
  ingress               = "INGRESS_TRAFFIC_ALL"
  allow_unauthenticated = true

  depends_on = [
    google_project_service.apis,
    google_secret_manager_secret_version.cms_database_url,
    google_secret_manager_secret_version.payload_secret,
    google_secret_manager_secret_version.gh_dispatch_token_placeholder,
    google_secret_manager_secret_iam_member.cms_database_url_access,
    google_secret_manager_secret_iam_member.payload_secret_access,
    google_secret_manager_secret_iam_member.gh_dispatch_token_access,
    google_sql_database.cms,
  ]
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
  cms_service_name = module.cms.service_name
  cms_domains      = var.cms_domains

  depends_on = [module.web, module.api, module.cms, google_project_service.apis]
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

output "cms_url" {
  value = module.cms.url
}

output "cms_media_bucket" {
  description = "GCS bucket for Payload CMS media (publicly readable — direct-GCS media URLs)"
  value       = google_storage_bucket.cms_media.name
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
