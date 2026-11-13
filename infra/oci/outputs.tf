output "site_public_ip" {
  description = "IP público do site. Configurar o DNS e TLS antes de publicar."
  value       = oci_core_instance.site.public_ip
}

output "admin_public_ip" {
  description = "IP público do servidor Admin. Não abrir a porta 4101 na Internet."
  value       = oci_core_instance.admin.public_ip
}

output "data_private_ip" {
  description = "IP privado do Data Server; esta instância não tem IP público."
  value       = oci_core_instance.data.private_ip
}

output "data_volume_ocid" {
  description = "Volume de dados persistente. Evitar destruição; planejar backup e restore."
  value       = oci_core_volume.postgres.id
}

output "data_nsg_ocid" {
  description = "NSG privado do Data Server."
  value       = oci_core_network_security_group.data.id
}
