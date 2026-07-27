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

variable "chatbot_enabled" {
  description = "Enable the members-only club Q&A assistant (CHATBOT_ENABLED). Set to \"true\" to activate; defaults to disabled."
  type        = string
  default     = "false"
}

variable "chatbot_model" {
  description = "AI SDK model ID used by the club Q&A assistant (CHATBOT_MODEL)."
  type        = string
  default     = "gemini-2.5-flash"
}

variable "assistant_enabled" {
  description = "Enable the game rescheduling AI copilot (ASSISTANT_ENABLED). Set to \"true\" to activate; defaults to disabled."
  type        = string
  default     = "false"
}

variable "assistant_model" {
  description = "Gemini model ID used by the rescheduling assistant (ASSISTANT_MODEL)."
  type        = string
  default     = "gemini-2.5-flash"
}

variable "google_generative_ai_api_key" {
  description = "Google AI Studio API key (GOOGLE_GENERATIVE_AI_API_KEY). Required when chatbot or assistant is enabled; stored in Secret Manager."
  type        = string
  sensitive   = true
}

variable "waha_base_url" {
  description = "Base URL of the WAHA (WhatsApp HTTP API) instance (WAHA_BASE_URL). Not a credential — the adapter sends no auth header — so it rides in env_vars. Leave empty to leave WhatsApp group delivery disabled; the API env schema rejects a non-URL value at boot, so an empty value is omitted from env_vars entirely rather than passed through as \"\"."
  type        = string
  default     = ""

  validation {
    condition     = var.waha_base_url == "" || can(regex("^https?://", var.waha_base_url))
    error_message = "waha_base_url must be empty or an http(s) URL."
  }
}

variable "waha_session" {
  description = "WAHA session name (WAHA_SESSION). Only meaningful when waha_base_url is set."
  type        = string
  default     = "default"
}

variable "smtp_host" {
  description = "SMTP relay host (SMTP_HOST) for the email notification channel. Not a credential, so it rides in env_vars. Leave empty to leave email delivery disabled: every SMTP_* key, and the smtp-password secret, is then omitted entirely rather than passed through as \"\", which the API env schema rejects at boot."
  type        = string
  default     = ""
}

variable "smtp_port" {
  description = "SMTP relay port (SMTP_PORT). 465 uses implicit TLS; anything else upgrades via STARTTLS. Only meaningful when smtp_host is set."
  type        = number
  default     = 587

  validation {
    condition     = var.smtp_port > 0 && var.smtp_port <= 65535
    error_message = "smtp_port must be a valid TCP port."
  }
}

variable "smtp_user" {
  description = "SMTP username (SMTP_USER). Only meaningful when smtp_host is set."
  type        = string
  default     = ""
}

variable "smtp_from" {
  description = "From header for notification email (SMTP_FROM), e.g. \"Dragons <noreply@example.de>\". Only meaningful when smtp_host is set."
  type        = string
  default     = ""
}

variable "smtp_password" {
  description = "SMTP password (SMTP_PASSWORD). The only credential in the set, so it is stored in Secret Manager rather than env_vars. Ignored when smtp_host is empty; the secret is then not created at all."
  type        = string
  sensitive   = true
  default     = ""
}

variable "expo_access_token" {
  description = "Expo access token (EXPO_ACCESS_TOKEN). Upgrades Expo Push to the authenticated send tier (higher rate limits, better receipt SLA). Credential, so it is stored in Secret Manager. Optional: empty means the secret is not created and push stays on the unauthenticated tier."
  type        = string
  sensitive   = true
  default     = ""
}

variable "mcp_token" {
  description = "Bearer token for the /mcp endpoint (MCP_TOKEN, min 32 chars). Stored in Secret Manager."
  type        = string
  sensitive   = true
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
