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
  name          = "conn-${var.environment}"
  region        = var.region
  min_instances = 2
  max_instances = 3
  subnet {
    name = google_compute_subnetwork.connector_subnet.name
  }
}

resource "google_compute_subnetwork" "psc_subnet" {
  name          = "psc-subnet-${var.environment}"
  ip_cidr_range = "10.9.0.0/24"
  region        = var.region
  network       = google_compute_network.main.id
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
