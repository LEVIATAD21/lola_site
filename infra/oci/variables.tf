variable "region" {
  description = "Home region Oracle do titular. Sempre use a região home para Always Free."
  type        = string
  validation {
    condition     = length(trimspace(var.region)) > 0
    error_message = "Informe sua home region OCI."
  }
}

variable "compartment_ocid" {
  description = "OCID do compartment da LOLA; evite usar a raiz da tenancy."
  type        = string
  validation {
    condition     = startswith(var.compartment_ocid, "ocid1.compartment.")
    error_message = "Informe um compartment OCID real."
  }
}

variable "micro_availability_domain" {
  description = "AD onde o shape E2.1.Micro é elegível e está disponível."
  type        = string
}

variable "ampere_availability_domain" {
  description = "AD onde o shape VM.Standard.A1.Flex possui capacidade Always Free."
  type        = string
}

variable "micro_image_ocid" {
  description = "Imagem oficial Ubuntu/Oracle Linux x86-64, compatível com E2.1.Micro e a home region."
  type        = string
  validation {
    condition     = startswith(var.micro_image_ocid, "ocid1.image.")
    error_message = "Informe uma image OCID real para o shape E2.1.Micro."
  }
}

variable "arm_image_ocid" {
  description = "Imagem oficial Ubuntu/Oracle Linux aarch64, compatível com A1 e a home region."
  type        = string
  validation {
    condition     = startswith(var.arm_image_ocid, "ocid1.image.")
    error_message = "Informe uma image OCID real ARM64 para o shape Ampere A1."
  }
}

variable "ssh_authorized_keys" {
  description = "Somente as chaves públicas SSH para administração via OCI Bastion; NUNCA chave privada."
  type        = string
  validation {
    condition     = startswith(trimspace(var.ssh_authorized_keys), "ssh-ed25519 ") || startswith(trimspace(var.ssh_authorized_keys), "ssh-rsa ")
    error_message = "Informe uma chave SSH pública no formato autorizado."
  }
}
