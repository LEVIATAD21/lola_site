# LOLA — Plano de integração de pagamentos Asaas

**Decisões aprovadas em 2026-11-11**

- Provedor: Asaas
- Operação: loja única (single merchant)
- Métodos: Pix e cartão
- Recebedor: conta Asaas de titularidade do proprietário da loja
- Checkout: cliente autenticado (conta obrigatória)
- Reembolsos: execução exclusiva por Admin autorizado
- Hospedagem e domínios: ainda não definidos
- Custo: priorizar plano sem mensalidade e infraestrutura gratuita; tarifas por transação do gateway são inevitáveis e devem ser confirmadas na conta do lojista.

## Regra financeira fundamental

A conta Asaas deve ser aberta e validada pelo proprietário da Lola. A API key de produção pertence a essa conta e será configurada como segredo no ambiente do servidor privado. A aplicação não recebe nem mantém saldo de clientes e não usa conta bancária do desenvolvedor.

O fluxo inicial é cobrança direta na conta do lojista. Não implementar split, subcontas, carteira própria ou transferência automática por pedido. A liquidação e a retirada para banco externo seguem os prazos, tarifas e regras da conta Asaas.

## Estado atual confirmado no código

- `src/server/orders.ts` define `PaymentMethod = 'pix' | 'boleto'`; cartão é explicitamente recusado enquanto não houver integração segura.
- Os registros atuais são pré-pedidos com `status: 'awaiting_payment_setup'` e `paymentStatus: 'not_configured'`.
- Os pedidos são cifrados em arquivo; estoque e reservas são mantidos pelo plano de dados local.
- `src/server/dataPlane.ts` expõe `createDraft`, mas ainda não possui contrato de cobrança, confirmação de pagamento ou reembolso.
- A estrutura de pedido atual não inclui conta autenticada do cliente; a decisão de login obrigatório exige implementar/validar autenticação e vínculo seguro entre conta e pedido.
- O Admin possui sessão autenticada, mas sessões e operador ainda são single-process/operador único; revisar controles de autorização e reautenticação antes de liberar reembolso.

## Arquitetura alvo

1. Navegador chama somente o backend público da Lola.
2. Backend público encaminha operações permitidas ao Data Server por canal interno autenticado e assinado.
3. Data Server cria a cobrança no Asaas usando segredo privado, persiste a associação pedido/cobrança e retorna apenas dados necessários ao checkout.
4. Para Pix, o servidor consulta `GET /v3/payments/{id}/pixQrCode` e devolve imagem Base64, payload copia e cola e expiração.
5. Para cartão, usar checkout/tokenização hospedada ou componente oficial do provedor. Nunca receber ou persistir PAN, CVV ou validade no backend da Lola.
6. Webhook do Asaas entra em endpoint dedicado no servidor de dados, valida o token de autenticação configurado para o webhook, persiste o evento e processa com idempotência.
7. Só evento/consulta autenticada do provedor pode confirmar pagamento e liberar pedido/baixa definitiva do estoque.
8. Admin solicita reembolso pelo backend; servidor valida saldo reembolsável, autorização, estado e idempotência antes de chamar o Asaas. Confirmação final depende do estado retornado pelo provedor/webhook.

## Modelo de estados a implementar

- Pedido: `awaiting_payment`, `paid`, `processing`, `shipped`, `delivered`, `cancelled`.
- Pagamento: `creating`, `pending`, `confirmed`, `overdue`, `refunded`, `partially_refunded`, `failed`, `cancelled`.
- Reembolso: `requested`, `under_review`, `approved`, `rejected`, `processing`, `pending_provider`, `refunded`, `failed`, `closed`.

Os estados finais e transições devem ser refinados a partir dos eventos oficiais do Asaas; não aceitar transições regressivas nem confirmação baseada no navegador.

## Etapas de implementação

### Fase 0 — Pré-requisitos e desenho
- [x] Decisões comerciais e financeiras registradas.
- [x] Confirmar que a integração Pix QR Code dinâmico é suportada pela API Asaas.
- [ ] Definir contrato de autenticação de clientes e recuperação de conta.
- [ ] Definir política de expiração de cobrança e cancelamento/liberação de reserva de estoque.
- [ ] Confirmar com o lojista taxas, prazos de liquidação e elegibilidade da conta Asaas.

### Fase 1 — Domínio de pagamentos no Data Server
- [ ] Criar adaptador Asaas isolado, com base URL Sandbox/produção configurável.
- [ ] Criar persistência durável de pagamentos, referências externas e eventos recebidos.
- [ ] Criar cobrança Pix e recuperar QR Code/copia e cola.
- [ ] Criar fluxo de cartão sem manipulação de dados sensíveis pela Lola.
- [ ] Adicionar timeout, retries seguros, idempotência e proteção contra cobrança duplicada.
- [ ] Expor operações ao site/Admin apenas pelo canal interno assinado.

### Fase 2 — Checkout autenticado
- [ ] Implementar/validar cadastro, login, recuperação e sessão de cliente.
- [ ] Vincular cada pedido ao ID interno do cliente autenticado.
- [ ] Implementar Pix QR Code e copia e cola.
- [ ] Implementar cartão via fluxo seguro suportado pelo Asaas.
- [ ] Consultar estado de pagamento sem confiar em parâmetros do cliente.
- [ ] Tratar expiração, cancelamento, repetição de tentativa e reserva de estoque.

### Fase 3 — Webhooks e conciliação
- [ ] Criar endpoint exclusivo para webhooks Asaas no Data Server.
- [ ] Validar `asaas-access-token` com segredo próprio do webhook.
- [ ] Persistir evento antes de responder sucesso.
- [ ] Deduplicar pelo ID do evento e garantir processamento idempotente.
- [ ] Consultar a API do Asaas quando evento ou estado forem inconsistentes.
- [ ] Não marcar pedido como pago com base apenas no redirect do checkout.

### Fase 4 — Admin e reembolsos
- [ ] Exibir ID da cobrança, método, valor, estado, datas e referência do pedido.
- [ ] Separar permissões de consulta, análise e execução financeira.
- [ ] Exigir reautenticação/MFA quando disponível antes de reembolso.
- [ ] Impedir reembolso acima do valor pago menos reembolsos já concluídos/em processamento.
- [ ] Usar chave de idempotência e registrar ator, motivo, valor e ID do reembolso Asaas.
- [ ] Respeitar o direito de arrependimento e demais direitos do consumidor; o Admin não pode negar direito legal arbitrariamente.

### Fase 5 — Segurança e homologação
- [ ] Testes unitários e de integração com Sandbox.
- [ ] Testar webhooks repetidos, fora de ordem, falsos, atrasados e indisponibilidade do Asaas.
- [ ] Testar Pix expirado, cartão recusado, reembolso parcial/total e corrida entre pagamento e cancelamento.
- [ ] Testar concorrência de estoque e persistência após reinício.
- [ ] Revisar logs para garantir ausência de API keys, tokens Pix e dados de cartão.
- [ ] Revisar LGPD, retenção, trilha de auditoria e backups.

### Fase 6 — Produção econômica
- [ ] Comparar hospedagem gratuita/baixo custo para os três serviços: Site, Admin e Data Server privado.
- [ ] Confirmar persistência em volume durável; não usar filesystem efêmero para pedidos/pagamentos.
- [ ] Configurar HTTPS, domínios, DNS, backups e monitoramento.
- [ ] Receber do proprietário a conta Asaas aprovada e configurar segredos diretamente no painel do host.
- [ ] Executar transação real de baixo valor e validar liquidação na conta do lojista antes da abertura pública.

## Segredos de ambiente (nomes propostos)

- `ASAAS_API_KEY`: segredo da conta do lojista; somente Data Server.
- `ASAAS_API_BASE_URL`: Sandbox ou produção, allowlist de hosts oficiais.
- `ASAAS_WEBHOOK_TOKEN`: token próprio configurado no webhook Asaas; somente Data Server.
- `ASAAS_TIMEOUT_MS`: timeout limitado para chamadas externas.
- `ASAAS_ENV`: `sandbox` ou `production`.

Não colocar segredos em Git, frontend, issues, logs ou mensagens. O proprietário deve inserir credenciais diretamente no gerenciador de secrets da hospedagem.

## Critérios para considerar pronto

- Pedido autenticado e cobrança vinculada de forma inequívoca.
- QR Code Pix dinâmico válido e pagamento conciliado por webhook/API.
- Cartão processado sem dados sensíveis atravessarem servidores da Lola.
- Nenhum pedido liberado sem confirmação do provedor.
- Nenhuma cobrança ou devolução duplicada sob retry/concor­rência.
- Reembolso controlado por Admin e confirmado pelo provedor.
- Dados financeiros e pedidos persistem após reinício e deploy.
- Conta recebedora verificada como pertencente ao proprietário da loja.
- Sandbox aprovado; produção somente após revisão final, secrets configurados e teste de liquidação.

## Referências oficiais

- https://docs.asaas.com/docs/cobrancas-via-pix
- https://docs.asaas.com/reference/obter-qr-code-para-pagamentos-via-pix
- https://docs.asaas.com/docs/visao-geral
- https://docs.asaas.com/docs/pix
- https://docs.asaas.com/
