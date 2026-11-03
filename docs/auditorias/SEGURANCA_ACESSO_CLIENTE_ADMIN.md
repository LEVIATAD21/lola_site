# Auditoria de segurança — Lola Aço Inox
## Controle de acesso, isolamento de dados e regras de negócio

**Data:** 2026-11-03  
**Escopo:** revisão estática do branch `feat/admin-integracao-producao` dos repositórios `lola_site` e `lola_site_admin`.  
**Tipo:** auditoria de código/configuração; não equivale a pentest dinâmico, teste de infraestrutura implantada ou certificação.

## Resumo executivo

A separação entre vitrine pública e servidor de dados é uma boa decisão arquitetural. O canal máquina-a-máquina usa HMAC, timestamp, nonce de uso único e assinatura de resposta. O armazenamento de pedidos usa AES-256-GCM. As rotas administrativas exigem chave de servidor e allowlist de origem.

Apesar dessas proteções, **o sistema não está pronto para operar com dados reais de clientes como painel administrativo de produção**. O painel separado ainda é demonstração local; não há autenticação humana com sessão, identidade individual ou autorização por função. A API administrativa atual é protegida por uma chave compartilhada e restrição de origem, e contém operações com dados pessoais e ações destrutivas.

Não foi identificada, nesta revisão estática, uma rota pública que entregue diretamente a lista de pedidos ou os dados pessoais completos. Isso não substitui testes dinâmicos de autorização.

## Achados

### A-01 — Painel administrativo sem autenticação real e sem integração com o servidor
**Severidade: ALTA | Confirmado**

Arquivo: `lola_site_admin/src/App.tsx`.

O painel usa dados de demonstração, `localStorage` (`lola-admin-demo`) e estado React. As próprias mensagens da interface informam que salvar, excluir, alterar preço, estoque e imagem só afeta o navegador. Não há cliente de API administrativa nem fluxo de login/sessão.

**Impacto:** não existe ainda uma fronteira de autenticação de operador no painel. Qualquer pessoa que abra o frontend consegue ver e manipular a demonstração local, mas essas alterações não devem alcançar o servidor. Não usar esta interface como ferramenta real de administração.

**Correção obrigatória:** implementar login administrativo no backend, sessão individual, cookies `HttpOnly`, `Secure`, `SameSite`, proteção CSRF, expiração/rotação/revogação e autorização server-side. Não inserir `LOLA_ADMIN_API_KEY` nem `LOLA_INTERNAL_SECRET` em variáveis Vite, bundle, localStorage ou código do navegador.

### A-02 — Chave administrativa compartilhada como única identidade
**Severidade: ALTA | Confirmado**

Arquivos: `lola_site/src/server/adminAuth.ts`, `adminRoutes.ts`, `data-server.ts`.

As rotas usam `x-admin-key`, comparação em tempo constante, mínimo de 32 caracteres e limite local de tentativas. Isso protege contra acesso sem a chave, mas a chave é uma credencial bearer compartilhada: não identifica qual pessoa operou, não permite revogar um operador individual e não separa permissões.

**Impacto:** vazamento da chave concede o conjunto de operações administrativas permitido à origem; auditoria não consegue atribuir com segurança uma ação a uma conta humana.

**Correção obrigatória:** substituir o acesso do navegador por sessão autenticada de usuário. Manter HMAC apenas para comunicação serviço-a-serviço. Se a chave de máquina continuar existindo, mantê-la exclusivamente em segredo de servidor e restringir seu uso a processos internos.

### A-03 — Dados pessoais e operações sensíveis concentrados no mesmo nível de privilégio
**Severidade: ALTA | Confirmado**

Arquivo: `lola_site/src/server/adminRoutes.ts`.

As rotas administrativas incluem:
- listar pré-pedidos;
- consultar pré-pedido individual;
- localizar pedidos por telefone ou nome;
- anonimizar dados pessoais;
- excluir pré-pedido;
- criar e atualizar rastreamento;
- baixar estoque.

Todas usam a mesma chave administrativa e a mesma allowlist. Não há autorização por função ou permissão específica por operação.

**Impacto:** qualquer credencial administrativa válida pode consultar dados pessoais e também executar operações destrutivas/operacionais.

**Correção obrigatória:** RBAC ou permissões explícitas no backend, por exemplo:
- `orders:read` para consultar pedidos;
- `customers:lookup` para localizar titular;
- `orders:redact` para anonimizar;
- `orders:delete` para exclusão excepcional;
- `inventory:adjust` para ajuste de estoque;
- `tracking:write` para atualizar rastreio;
- `catalog:write` para administrar catálogo.

Ações destrutivas devem exigir confirmação explícita, motivo, registro de auditoria com identidade do operador e, quando adequado, dupla confirmação. Não retornar dados pessoais em listagens desnecessárias.

### A-04 — Quantidade exata de estoque exposta na API pública
**Severidade: MÉDIA | Confirmado**

Arquivo: `lola_site/server.ts`, rotas `GET /api/produtos`, `GET /api/produto/:productId` e `GET /api/estoque/:productId`.

A vitrine recebe o campo `disponivel` com a quantidade exata. A rota de estoque já omite os contadores internos `reservado` e `vendido`, o que é correto, mas ainda revela o saldo comercial exato.

**Impacto:** concorrentes e robôs podem inferir giro, reposição e disponibilidade por produto. Rate limit reduz raspagem, mas não torna o dado privado.

**Correção recomendada:** expor apenas estado comercial necessário à compra (disponível/esgotado ou faixas como poucas unidades), mantendo o saldo exato somente no servidor. O checkout continua validando saldo real no backend.

### A-05 — Allowlist de IP pode deixar de representar o operador quando há proxy
**Severidade: ALTA se houver proxy público | Dependente da configuração**

Arquivos: `lola_site/src/server/adminRoutes.ts`, `ipAllow.ts`, `data-server.ts`.

A origem administrativa é verificada por `req.socket.remoteAddress`. Isso evita confiar cegamente em `X-Forwarded-For`, mas, atrás de um proxy reverso, o socket pode identificar o proxy e não a pessoa que acessou. A allowlist padrão aceita redes privadas; a configuração `LOLA_ADMIN_ALLOWED_IPS=any` libera qualquer origem que alcance o serviço.

**Impacto:** se um proxy público encaminhar requisições ao servidor de dados e seu IP estiver dentro da faixa permitida, a allowlist pode não distinguir os clientes finais. Se `any` for usado, a restrição de origem deixa de proteger.

**Correção obrigatória antes do deploy:** manter o servidor de dados sem exposição pública direta; firewall/rede privada permitindo apenas o backend autorizado; não usar `any`; documentar e validar exatamente o IP do peer/proxy. Não confiar em cabeçalhos de origem enviados pelo cliente.

### A-06 — Rate limit em memória não protege uma implantação com múltiplas instâncias
**Severidade: MÉDIA | Confirmado pela implementação**

Arquivo: `lola_site/src/server/rateLimit.ts`.

Os buckets são mantidos em um `Map` por processo. A própria implementação documenta que uma implantação multi-instância precisa de limite compartilhado/WAF.

**Impacto:** com múltiplas instâncias, cada uma mantém sua própria cota; o limite efetivo pode ser multiplicado. Reiniciar processos também limpa os contadores.

**Correção:** manter uma única instância enquanto essa limitação for aceita ou adotar rate limit compartilhado no gateway/armazenamento central. Aplicar limites específicos também no edge/WAF e monitorar abuso.

### A-07 — API pública de catálogo e estoque precisa manter política de divulgação mínima
**Severidade: MÉDIA | Confirmado**

As rotas públicas de catálogo são intencionalmente acessíveis. A resposta deve conter somente dados necessários à compra: nome, descrição comercial, preço, imagens públicas, categoria e disponibilidade simplificada. Não incluir custos internos, margem, fornecedor, notas privadas, IDs internos de operação, vendas, reservas ou metadados administrativos em futuras extensões do catálogo.

**Correção:** criar DTOs públicos por allowlist de campos; nunca serializar diretamente registros administrativos ou objetos completos do banco.

### A-08 — Regras de pagamento e frete ainda não representam uma transação real
**Severidade: ALTA para operação comercial | Confirmado**

Arquivos: `lola_site/src/server/orders.ts` e `src/services/api.ts`.

O backend rejeita cartão e registra pré-pedidos com `awaiting_payment_setup` / `not_configured`. O código calcula frete por valores fixos e regra de gratuidade configurada no próprio código; não é cotação real dos Correios/transportadora. Não foi identificada integração de gateway/webhook de pagamento neste fluxo.

**Impacto:** não se pode afirmar que pagamento foi recebido, pedido foi pago ou frete foi contratado com base nesses estados. O cliente não pode alterar total, desconto, frete ou preço final por payload.

**Correção:** manter o estado explícito de pré-pedido até integração real. Ao integrar pagamento, validar assinatura de webhook, idempotência, valor/ moeda/ pedido, transições permitidas e conciliação. Cotação logística deve vir do provedor ou ser apresentada claramente como estimativa/regra fixa.

### A-09 — Rastreio público deve continuar sem dados pessoais
**Severidade: MÉDIA | Controle atual positivo; requer testes**

Arquivo: `lola_site/src/server/tracking.ts`.

A consulta pública exige token aleatório de alta entropia e retorna número do pedido, código de transporte, status e eventos, sem nome, telefone ou endereço. Isso é uma separação correta.

**Risco residual:** descrição e localização dos eventos são dados públicos e precisam ser limitados a informação logística. Nunca inserir endereço residencial, telefone, nome completo, instruções de entrega ou observações internas nos campos públicos.

**Correção:** preservar o token não adivinhável, não aceitar número de pedido como autorização, limitar consultas e validar/limitar todo conteúdo publicado.

### A-10 — Canal interno é privilegiado e deve permanecer estritamente máquina-a-máquina
**Severidade: CRÍTICA se exposto ou se o segredo vazar | Controle atual positivo; configuração crítica**

Arquivos: `lola_site/src/server/internalAuth.ts`, `internalRoutes.ts`, `internalClient.ts`, `data-server.ts`.

O canal interno usa timestamp, nonce, HMAC sobre método/caminho/corpo e assinatura de resposta. O servidor de dados exige segredo e, por padrão, faz bind em loopback; em produção recusa bind coringa sem opt-in.

**Impacto se comprometido:** o canal permite ler snapshot de estoque e criar pré-pedidos. Não deve ser acessível por navegador, aplicativo cliente ou rede pública.

**Correção obrigatória:** segredo forte e exclusivo, TLS quando atravessar hosts, firewall allowlist entre serviços, rotação documentada, logs sem segredo e testes que provem que requisições sem assinatura, repetidas, expiradas ou adulteradas são recusadas.

## Matriz de acesso pretendida

| Recurso/ação | Cliente comum | Operador autorizado | Backend interno |
|---|---:|---:|---:|
| Ver produtos/preços publicados | Sim | Sim | Sim |
| Ver disponibilidade simplificada | Sim | Sim | Sim |
| Ver saldo exato, reservas e vendidos | Não | Conforme permissão | Sim |
| Consultar dados pessoais de pedidos | Não | Permissão específica | Sim |
| Pesquisar cliente por telefone/nome | Não | Permissão específica | Sim |
| Criar pré-pedido próprio | Sim, sem confiar no payload | Sim | Sim |
| Listar pedidos de terceiros | Não | Permissão específica | Sim |
| Alterar preço/catálogo/publicação | Não | `catalog:write` | Sim |
| Ajustar estoque | Não | `inventory:adjust` | Sim |
| Criar/alterar rastreamento | Não | `tracking:write` | Sim |
| Anonimizar/excluir pedidos | Não | Permissão restrita e auditada | Sim |
| Acessar chaves, arquivos, backups ou variáveis de ambiente | Nunca | Nunca pelo painel | Apenas processo/infra autorizada |
| Consultar canal `/internal` | Não | Não diretamente | Apenas serviço autenticado |

## Dados e operações que nunca devem ser expostos ao cliente comum

1. Nome, telefone, endereço, complemento, histórico e conteúdo integral de pedidos de outras pessoas.
2. Pesquisa de titular, exportação, anonimização, exclusão e funções administrativas.
3. Saldo exato de estoque, quantidade reservada, unidades vendidas, margem, custo, fornecedor e notas internas.
4. Chaves, tokens, segredos HMAC, chaves de criptografia, cookies de sessão, variáveis de ambiente, caminhos de arquivos, backups e logs internos.
5. Rotas internas, endpoints administrativos, operações de manutenção e ferramentas de diagnóstico não destinadas ao público.
6. Capacidade de mudar preço, desconto, cupom, frete, estoque, status de pagamento, status de pedido ou rastreamento por manipulação do navegador.
7. Dados de outros clientes, mesmo que o usuário altere IDs, telefone, número do pedido ou parâmetros na URL.

## Regras de negócio que devem ser sempre validadas no servidor

- Recalcular preço unitário a partir do catálogo autoritativo; ignorar preço/total enviados pelo navegador.
- Recalcular subtotal, cupom, desconto, embalagem e frete no backend.
- Validar publicação/arquivamento e disponibilidade do produto antes de aceitar o pedido.
- Reservar estoque atomicamente e impedir saldo negativo, inclusive com linhas duplicadas e pedidos concorrentes.
- Validar transições de estado; cliente nunca define `paid`, `delivered`, `refunded`, `cancelled` ou status administrativo.
- Não aceitar `customerId`, `role`, `isAdmin`, `permissions`, `price`, `discount`, `shippingCost` ou `paymentStatus` como autoridade vindos do cliente.
- Usar idempotência para criação de pedidos, pagamentos e webhooks.
- Vincular consultas de pedido a sessão/prova de posse adequada; número do pedido isolado não é segredo nem autorização.
- Validar uploads por tipo real, tamanho, extensão, conteúdo, nome aleatório e armazenamento fora da execução do servidor; nunca confiar em MIME declarado pelo navegador.
- Registrar operador, ação, recurso, horário, origem e resultado em trilha de auditoria sem registrar senhas, tokens ou dados pessoais desnecessários.

## Controles já observados e que devem ser preservados

- HMAC com timestamp, nonce e assinatura de resposta no canal interno.
- Chave administrativa comparada com `timingSafeEqual`, comprimento mínimo e rate limit.
- Allowlist de origem no servidor de dados.
- Headers de segurança e guarda contra escrita cross-site na vitrine.
- Rate limit por rota/IP no processo.
- Estoque persistido com gravação atômica e pré-reserva para checkout.
- Pedidos e rastreamento cifrados com AES-256-GCM e permissões restritas de arquivo.
- Sanitização/limites de campos de pedido e exclusão de dados de cartão do payload.

## Plano de correção priorizado

### P0 — antes de qualquer dado real
1. Não publicar o painel atual como administração real.
2. Garantir que o servidor de dados não esteja publicamente acessível; firewall entre serviços e sem `LOLA_ADMIN_ALLOWED_IPS=any`.
3. Manter todos os segredos apenas no servidor; rotacionar qualquer chave que já tenha sido colocada em frontend, repositório ou log.
4. Implementar sessão humana segura e autorização server-side por permissão.
5. Fazer teste negativo de todas as rotas: sem sessão, cliente comum, sessão expirada, CSRF, origem não permitida e usuário sem permissão.
6. Garantir que dados pessoais e operações administrativas não apareçam em respostas públicas, erros ou logs.

### P1 — antes do lançamento comercial
1. Reduzir estoque público a disponibilidade simplificada.
2. Implementar DTOs públicos explícitos.
3. Completar trilha de auditoria e controles para ações destrutivas.
4. Testar concorrência, idempotência, limites e recuperação de backup.
5. Integrar gateway e logística reais antes de apresentar pedidos como pagos ou fretes como cotados.

### P2 — endurecimento contínuo
1. Rate limit compartilhado/WAF para múltiplas instâncias.
2. Alertas para falhas de login, enumeração, abuso de cupom, excesso de pedidos e ações administrativas.
3. Rotação de segredos, restauração testada e revisão periódica de permissões.
4. Testes automatizados de IDOR/BOLA, mass assignment, XSS armazenado, CSRF, SSRF e abuso de fluxo de negócio.

## Limitações desta auditoria

- Não foram executados testes dinâmicos contra ambiente implantado.
- Não foram inspecionados segredos reais, regras de firewall, DNS, configuração de proxy, permissões de conta cloud ou backups em produção.
- Não foi feita análise de dependências/CVEs nesta etapa.
- Não se afirma ausência de vulnerabilidades. As conclusões são limitadas aos arquivos e branches revisados.
- O painel administrativo estático foi inspecionado; páginas de demonstração não equivalem a uma API protegida.

**Conclusão:** a vitrine tem algumas proteções úteis e o canal interno foi desenhado com boas propriedades criptográficas. Porém, o painel real, a identidade dos operadores e a autorização granular ainda não existem. Até resolver os itens P0 e validar a infraestrutura, não liberar dados reais nem considerar a administração pronta para produção.
