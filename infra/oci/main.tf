terraform {
  required_version = ">= 1.7.0"

  required_providers {
    oci = {
      source  = "oracle/oci"
      version = "= 7.16.0"
    }
  }
}

# Credenciais vêm exclusivamente do ambiente OCI CLI/Terraform (NUNCA do Git).
provider "oci" {
  region = var.region
}

resource "oci_core_vcn" "lola" {
  compartment_id = var.compartment_ocid
  cidr_block     = "10.20.0.0/16"
  display_name   = "lola-production-vcn"
  dns_label      = "lolaprod"
}

resource "oci_core_internet_gateway" "public" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.lola.id
  display_name   = "lola-public-gateway"
  enabled        = true
}

resource "oci_core_nat_gateway" "private" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.lola.id
  display_name   = "lola-private-egress"
}

resource "oci_core_route_table" "public" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.lola.id
  display_name   = "lola-public-route"
  route_rules {
    network_entity_id = oci_core_internet_gateway.public.id
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
  }
}

resource "oci_core_route_table" "private" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.lola.id
  display_name   = "lola-private-route"
  route_rules {
    network_entity_id = oci_core_nat_gateway.private.id
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
  }
}

resource "oci_core_subnet" "site" {
  compartment_id             = var.compartment_ocid
  vcn_id                     = oci_core_vcn.lola.id
  cidr_block                 = "10.20.10.0/24"
  display_name               = "lola-public-site"
  dns_label                  = "site"
  prohibit_public_ip_on_vnic = false
  route_table_id             = oci_core_route_table.public.id
}

resource "oci_core_subnet" "admin" {
  compartment_id             = var.compartment_ocid
  vcn_id                     = oci_core_vcn.lola.id
  cidr_block                 = "10.20.20.0/24"
  display_name               = "lola-public-admin"
  dns_label                  = "admin"
  prohibit_public_ip_on_vnic = false
  route_table_id             = oci_core_route_table.public.id
}

resource "oci_core_subnet" "data" {
  compartment_id             = var.compartment_ocid
  vcn_id                     = oci_core_vcn.lola.id
  cidr_block                 = "10.20.30.0/24"
  display_name               = "lola-private-data"
  dns_label                  = "data"
  prohibit_public_ip_on_vnic = true
  route_table_id             = oci_core_route_table.private.id
}

resource "oci_core_network_security_group" "site" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.lola.id
  display_name   = "lola-site-nsg"
}

resource "oci_core_network_security_group" "admin" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.lola.id
  display_name   = "lola-admin-nsg"
}

resource "oci_core_network_security_group" "data" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.lola.id
  display_name   = "lola-data-nsg"
}

resource "oci_core_network_security_group_security_rule" "site_http" {
  network_security_group_id = oci_core_network_security_group.site.id
  direction                 = "INGRESS"
  protocol                  = "6"
  source                    = "0.0.0.0/0"
  source_type               = "CIDR_BLOCK"
  tcp_options {
    destination_port_range {
      min = 80
      max = 80
    }
  }
}

resource "oci_core_network_security_group_security_rule" "site_https" {
  network_security_group_id = oci_core_network_security_group.site.id
  direction                 = "INGRESS"
  protocol                  = "6"
  source                    = "0.0.0.0/0"
  source_type               = "CIDR_BLOCK"
  tcp_options {
    destination_port_range {
      min = 443
      max = 443
    }
  }
}

resource "oci_core_network_security_group_security_rule" "admin_http" {
  network_security_group_id = oci_core_network_security_group.admin.id
  direction                 = "INGRESS"
  protocol                  = "6"
  source                    = "0.0.0.0/0"
  source_type               = "CIDR_BLOCK"
  tcp_options {
    destination_port_range {
      min = 80
      max = 80
    }
  }
}

resource "oci_core_network_security_group_security_rule" "admin_https" {
  network_security_group_id = oci_core_network_security_group.admin.id
  direction                 = "INGRESS"
  protocol                  = "6"
  source                    = "0.0.0.0/0"
  source_type               = "CIDR_BLOCK"
  tcp_options {
    destination_port_range {
      min = 443
      max = 443
    }
  }
}

# A porta do Data Server recebe somente conexões de VNICs dentro dos NSGs
# Site e Admin; NUNCA existe regra 0.0.0.0/0 ou porta PostgreSQL 5432.
resource "oci_core_network_security_group_security_rule" "data_from_site" {
  network_security_group_id = oci_core_network_security_group.data.id
  direction                 = "INGRESS"
  protocol                  = "6"
  source                    = oci_core_network_security_group.site.id
  source_type               = "NETWORK_SECURITY_GROUP"
  tcp_options {
    destination_port_range {
      min = 4100
      max = 4100
    }
  }
}

resource "oci_core_network_security_group_security_rule" "data_from_admin" {
  network_security_group_id = oci_core_network_security_group.data.id
  direction                 = "INGRESS"
  protocol                  = "6"
  source                    = oci_core_network_security_group.admin.id
  source_type               = "NETWORK_SECURITY_GROUP"
  tcp_options {
    destination_port_range {
      min = 4100
      max = 4100
    }
  }
}

resource "oci_core_network_security_group_security_rule" "site_egress" {
  network_security_group_id = oci_core_network_security_group.site.id
  direction                 = "EGRESS"
  protocol                  = "all"
  destination               = "0.0.0.0/0"
  destination_type          = "CIDR_BLOCK"
}

resource "oci_core_network_security_group_security_rule" "admin_egress" {
  network_security_group_id = oci_core_network_security_group.admin.id
  direction                 = "EGRESS"
  protocol                  = "all"
  destination               = "0.0.0.0/0"
  destination_type          = "CIDR_BLOCK"
}

resource "oci_core_network_security_group_security_rule" "data_egress" {
  network_security_group_id = oci_core_network_security_group.data.id
  direction                 = "EGRESS"
  protocol                  = "all"
  destination               = "0.0.0.0/0"
  destination_type          = "CIDR_BLOCK"
}

# As imagens devem ser as versões oficiais Ubuntu corretas para a home region.
# OCI rejeitará shapes sem capacidade; NÃO substitua por shape pago.
resource "oci_core_instance" "site" {
  availability_domain = var.micro_availability_domain
  compartment_id      = var.compartment_ocid
  display_name        = "lola-production-site"
  shape               = "VM.Standard.E2.1.Micro"
  create_vnic_details {
    subnet_id        = oci_core_subnet.site.id
    assign_public_ip = true
    nsg_ids          = [oci_core_network_security_group.site.id]
  }
  source_details {
    source_type             = "image"
    source_id               = var.micro_image_ocid
    boot_volume_size_in_gbs = 50
  }
  metadata = {
    ssh_authorized_keys = var.ssh_authorized_keys
  }
}

resource "oci_core_instance" "admin" {
  availability_domain = var.micro_availability_domain
  compartment_id      = var.compartment_ocid
  display_name        = "lola-production-admin"
  shape               = "VM.Standard.E2.1.Micro"
  create_vnic_details {
    subnet_id        = oci_core_subnet.admin.id
    assign_public_ip = true
    nsg_ids          = [oci_core_network_security_group.admin.id]
  }
  source_details {
    source_type             = "image"
    source_id               = var.micro_image_ocid
    boot_volume_size_in_gbs = 50
  }
  metadata = {
    ssh_authorized_keys = var.ssh_authorized_keys
  }
}

resource "oci_core_instance" "data" {
  availability_domain = var.ampere_availability_domain
  compartment_id      = var.compartment_ocid
  display_name        = "lola-production-data"
  shape               = "VM.Standard.A1.Flex"
  shape_config {
    ocpus         = 2
    memory_in_gbs = 12
  }
  create_vnic_details {
    subnet_id        = oci_core_subnet.data.id
    assign_public_ip = false
    nsg_ids          = [oci_core_network_security_group.data.id]
  }
  source_details {
    source_type             = "image"
    source_id               = var.arm_image_ocid
    boot_volume_size_in_gbs = 50
  }
  metadata = {
    ssh_authorized_keys = var.ssh_authorized_keys
  }
  lifecycle {
    prevent_destroy = true
  }
}

resource "oci_core_volume" "postgres" {
  availability_domain = var.ampere_availability_domain
  compartment_id      = var.compartment_ocid
  display_name        = "lola-postgres-volume"
  size_in_gbs         = 50
  lifecycle {
    prevent_destroy = true
  }
}

resource "oci_core_volume_attachment" "postgres" {
  attachment_type = "paravirtualized"
  instance_id     = oci_core_instance.data.id
  volume_id       = oci_core_volume.postgres.id
}
