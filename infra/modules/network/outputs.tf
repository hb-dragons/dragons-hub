output "network_name" {
  value = google_compute_network.main.name
}

output "network_id" {
  value = google_compute_network.main.id
}

output "connector_id" {
  value = google_vpc_access_connector.connector.id
}

output "psc_subnet_id" {
  value = google_compute_subnetwork.psc_subnet.id
}
