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
  load_balancing_scheme = "EXTERNAL_MANAGED"

  backend {
    group = google_compute_region_network_endpoint_group.web_neg.id
  }
}

resource "google_compute_backend_service" "api_backend" {
  name                  = "dragons-api-backend-${var.environment}"
  protocol              = "HTTP"
  port_name             = "http"
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
