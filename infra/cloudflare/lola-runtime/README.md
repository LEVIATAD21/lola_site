# LOLA — evolução do banco principal e identidade separada (Cloudflare)

## Objetivo e estado

Este diretório contém **código de implementação**, migrations SQLite D1, funções
privadas para verificação real de e-mail e telefone, e a tarefa automática de
limpeza de registros temporários. Não é um protótipo de pagamentos; também
**NÃO é, sozinho, uma API de checkout pronta**. Nenhuma credencial/resposta
fictícia foi adicionada ao banco real. Não publicamos funções que permitam
confirmar pagamentos, alterar estoques ou apagar histórico por HTTP.

O banco existente `lola_db_2026` (UUID
`5c523efb-8580-48ae-bdb0-bd4fb2ae7fb5`) será utilizado como banco comercial
**quando for migrado e homologado**, em vez de ser descartado como demonstração.
Apenas o proprietário da conta pode confirmar, pelo painel/CLI autenticado,
a criação e os dados dentro desse D1.

### Dois bancos

| Banco | Binding | Retenção |
| --- | --- | --- |
| `lola_db_2026` | `DB` | Catálogo, pedidos, pagamento, conciliação e trilha financeira mantidos conforme necessidade legal |
| `lola-users-db` | `USERS_DB` | Identidade, e-mail/telefone verificados, senha protegida, sessão e projeção de compras |
| Temporários em ambos | Tabelas de TTL | Limpeza programada diariamente após vencimento |

**Regra arquitetural:** o D1 não oferece transação entre bancos distintos.
O `DB` é autoridade dos pedidos e valores; a projeção de compras em
`USERS_DB` deve ser atualizada via outbox idempotente e reconciliada. Se uma
replicação falhar, o pedido não pode ser perdido nem cobrado outra vez.
Histórico não deve depender de exclusão da conta nem de dados temporários.

Nenhum CPF, RG, foto de documento, PAN, CVV, validade do cartão nem senha
reversível entra nestas tabelas. Dados de entrega necessários para cumprir
pedido terão política de finalidade, acesso e retenção separada.

## O que o Cron efetivamente faz

`src/maintenance.js` executa em **03:00 UTC diariamente** (00:00 no horário
padrão de Brasília), sem rota HTTP para acionamento por visitantes, e remove
no máximo 200 registros vencidos por tabela por execução:

- `verification_challenges`: códigos expostos a replay após expiração;
- `user_sessions`: sessões expiradas/revogadas;
- `phone_verification_attempts`: desafios telefônicos expirados;
- `auth_rate_buckets`: janelas antigas de limitação;
- `commerce_temporary_artifacts`: metadados de cache cuja validade acabou,
  mas **somente** quando `legal_hold=0`.

**Nunca exclui automaticamente:** clientes, histórico de compra, linhas dos
pedidos, pagamentos, eventos de webhook, reembolsos e auditoria financeira.

A tabela de artefatos não armazena bytes de PDFs, boletos ou comprovantes.
Arquivos físicos futuros precisarão de object storage, rotina própria
de exclusão, verificação e backup/retention lock. A limpeza dos metadados
não garante a remoção de bytes guardados em outro serviço.

A LGPD (arts. 15-16) permite conservar dados para obrigações legais. Regras
fiscais, de arrependimento, contestação e retenção devem ser validadas com
contabilidade e assessoria jurídica; **não** configurar sete dias como prazo
de destruição de documentos fiscais ou transações.

## E-mail de verificação

A implementação privada em `src/emailVerification.js` cria um OTP numérico
de 8 dígitos, com 10 minutos de validade, cinco tentativas e HMAC-SHA-256
no D1. Código puro só vai para o provedor, não é retornado por API nem
gravado em texto aberto. Envio tem limite por conta e precisa de proteção
adicional por IP, Turnstile e sessão no roteador de cadastro.

Serviço sugerido: **Resend**, plano sem mensalidade com cota limitada.
Obrigatório: domínio verificado do remetente e segredos do provedor guardados
em Cloudflare Worker Secrets, nunca em Git ou bundle Vite.

Segredos/variáveis do Worker de autenticação (ainda não publicado):

- `RESEND_API_KEY` — segredo, criar pelo painel do provedor;
- `EMAIL_OTP_HMAC_KEY` — segredo independente aleatório >=32 caracteres;
- `LOLA_MAIL_FROM` — remetente real de domínio verificado, por exemplo
  `verificacao@SEU-DOMINIO` (não enviar até ter domínio válido).

O código de e-mail não verifica "Gmail" especificamente: verifica posse do
endereço informado, inclusive @gmail.com, @outlook.com e outros.

## Telefone e custo real

`src/phoneVerification.js` implementa adaptador privado para **Twilio Verify**,
mas bloqueia envio por padrão. Confirmação telefônica exigirá API habilitada,
operador autenticado, proteção contra abuso e aprovação de custo. Não existe
garantia de SMS em volume ilimitado e 100% gratuito.

Variáveis, somente quando proprietário autorizar SMS pago:
`LOLA_SMS_ENABLED=true`, `LOLA_SMS_COSTS_APPROVED=true`,
`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
`TWILIO_VERIFY_SERVICE_SID`.

**Política de conta comercial:** antes de aceitar pedido, exigir
`email_verified_at` e `phone_verified_at`; sem serviço de SMS contratado,
deixar checkout bloqueado, em vez de inventar um status "verificado". Para
administração, exigir MFA/passkey independente do telefone do cliente.

## Implantação do job de limpeza

1. No painel Cloudflare: **Storage & databases → D1 → Create database**,
   nome exato `lola-users-db`. Copie somente o UUID (não é chave de acesso).
2. Use seu PC ou ambiente de CI autorizado com Wrangler autenticado.
   Verifique em `wrangler d1 list` que o banco principal está na mesma conta.
3. Crie backup/snapshot dos bancos quando necessário. A migração dos schemas
   ainda depende da revisão do fluxo comercial/contas.
4. Execute as migrations primeiro na base correspondente, nunca cruzadas:

```bash
cd infra/cloudflare/lola-runtime
npx wrangler@latest login
npx wrangler@latest d1 list
npx wrangler@latest d1 execute lola-users-db --remote --file=migrations/users/0001_users.sql
npx wrangler@latest d1 execute lola_db_2026 --remote --file=migrations/commerce/0002_commerce.sql
```

Esses comandos **criam tabelas reais** nos seus D1. Antes de executá-los,
revise a conta, o identificador, backup, permissões e consistência com a
base atual. Não rode em banco que contenha outra loja.

5. Configure o UUID REAL do segundo banco como variável local de ambiente e
   gere o `wrangler.toml` privado:

```bash
export LOLA_USERS_DATABASE_ID='UUID_REAL_DO_BANCO_DE_USUARIOS'
node generate-config.mjs
npx wrangler@latest deploy
```

`generate-config.mjs` não aceita UUID ausente, inválido ou igual ao banco
principal. O Worker `lola-maintenance` só executa por Cron e recusa HTTP.
O cron será ativado **após** o deploy real.

## Bloqueios para ativar vendas

- Adicionar cadastro de cliente e sessões reais com hashing Argon2id e
  revogação; endpoints com validação e rate limit por IP/conta/Turnstile;
- Conectar storefront e Admin à camada D1 em Workers, remover escrita em
  arquivo de pedidos/estoque e validar concorrência/rollback;
- Implementar outbox/reconciliador dos históricos entre D1 (sem FK cross-DB);
- Habilitar e testar Resend em domínio verificado;
- Escolher e aprovar financeiramente SMS real ou alternativa equivalente,
  pois 100% gratuito ilimitado não existe na prática;
- Ligar Asaas ao pedido persistido, proteger webhook, conciliar sem duplicar,
  e auditar estorno autorizado pelo Admin;
- Confirmar backups, recuperação e testes de carga do plano Cloudflare Free;
- Controlar ocupação (limite **500 MB por D1** no Free). Acompanhar com
  `npx wrangler d1 info <nome> --json` e alertar antes de 80/90% de quota.
  Nunca apagar registros obrigatórios por atingir 99%.

**Não fazer deploy financeiro só porque as migrations e o Cron passaram no CI.**
