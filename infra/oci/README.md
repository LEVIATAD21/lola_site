# LOLA — provisionamento OCI para produção

Este diretório contém **infraestrutura real** para a Oracle Cloud Infrastructure, visando
o Always Free. **Não executa pagamentos e não instala automaticamente os aplicativos**:
isso depende da migração PostgreSQL, homologação Asaas, TLS, backups e aprovação final.

## Recursos declarados

- 1 site público em `VM.Standard.E2.1.Micro`, boot 50 GB;
- 1 Admin/BFF em outra `VM.Standard.E2.1.Micro`, boot 50 GB;
- 1 Data Server + PostgreSQL em `VM.Standard.A1.Flex` com 2 OCPUs/12 GB, boot 50 GB;
- 1 Block Volume PostgreSQL de 50 GB, com `prevent_destroy`;
- VCN com 2 sub-redes públicas, 1 privada, NAT/Internet Gateway e NSGs separados;
- somente 80/443 públicos nas VMs Site e Admin, API privada 4100 a partir do Site/Admin,
  **sem publicação de PostgreSQL 5432 e sem SSH público**.

Os 200 GB declarados consomem o total da franquia de boot+block volume Always Free.
Confirme a elegibilidade real e **custos do plano** na tenancy antes de qualquer `apply`.
Se outra VM ou volume já consumir quota, NÃO faça o provisionamento por impulso.
Tanto E2.1.Micro quanto A1 podem estar indisponíveis na região/AD.

## Pré-requisitos obrigatórios (ainda não verificados nesta branch)

1. Conta OCI ativa e home region correta, nunca upgrade Pay As You Go por engano.
2. Compartment com política de mínimo privilégio.
3. Formatos elegíveis e imagens oficiais para AMD x86-64 / ARM64.
4. Terraform com provider Oracle. Autenticação OCI por perfil/variáveis em ambiente
   seguro — jamais credenciais no repositório ou em `*.tfvars` versionado.
5. Chave pública SSH (a chave **privada** não entra no Terraform).
6. Backend de state seguro, criptografado e protegido contra acesso não autorizado.
   O state contém identificadores sensíveis de infraestrutura.
7. Estratégia de acesso operacional via OCI Bastion/Run Command, restrita a pessoal autorizado.
   Nenhuma regra SSH na Internet foi criada de propósito.

## Processo de aprovação

Aplique na pasta `infra/oci` **somente depois** de revisar elegibilidade da conta,
quotas e eventual cobrança de recursos auxiliares. Não há valores fictícios no código;
as variáveis obrigatórias devem ser injetadas no ambiente pelo operador.

```bash
terraform init
terraform fmt -check -recursive
terraform validate
terraform plan -out=tfplan
terraform show tfplan
```

Verifique que o plano não cria nenhum shape além de `E2.1.Micro` e `A1.Flex`,
não aloca mais de 200 GB de boot+block volume e não cria regras públicas nas portas
22, 4100, 4101, 5432. Confira também preços da região, limites e NAT gateway.

Só após a aprovação expressa do plano e confirmação do status Always Free:

```bash
terraform apply tfplan
```

O arquivo `tfplan` é sensível e não deve ser enviado ao GitHub. Sem acesso à tenancy
não temos como executar/confirmar um `plan` com valores reais nem afirmar que recursos
foram criados.

## Após provisionar as VMs

- Preparar acesso Bastion/Run Command e reforçar hardening do SO;
- Montar e formatar o Block Volume por UUID estável, com fstab e backups;
- Instalar PostgreSQL em storage persistente, ligado somente em loopback;
- Conectar o Data Server à migração `db/migrations/0001_core.sql` e eliminar
  armazenamento em arquivo de pedidos/estoque;
- Configurar Vault, chaves, operação de backup+WAL com teste de restauração;
- Instalar imagem/artefato imutável aprovado do Site e do BFF;
- Configurar DNS, HTTPS, logs, métricas, alertas e webhooks Asaas autenticados;
- Testar Sandbox Pix/cartão/reembolso, concorrência de estoque e incidente/rollback;
- Fazer go-live **apenas com aceite do proprietário** e fluxo canário monitorado.

O estado **real do código** deve ser consultado nos PRs #16 (Site) e #13 (Admin).
Este IaC prepara recursos e rede, não serve como prova de prontidão comercial.
