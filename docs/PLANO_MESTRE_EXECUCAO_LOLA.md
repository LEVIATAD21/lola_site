# Plano mestre de análise e execução — LOLA Aço Inox

**Escopo:** integração coordenada dos repositórios `lola_site` (loja, API e dados) e `lola_site_admin` (painel administrativo).  
**Branch de trabalho:** `feat/admin-integracao-producao`.  
**Regra de segurança:** não fazer merge em `main`, não publicar dados reais e não contratar serviço pago sem autorização explícita.

> Este documento é um plano de execução e critérios de aceite. Não declara funcionalidades como implementadas. A situação descrita foi inferida da inspeção estática dos arquivos da branch; testes dinâmicos, infraestrutura real e contas externas ainda precisam ser verificados.

## 1. Diagnóstico executivo

### Loja — `lola_site`
A loja possui frontend React/Vite, servidor Express, servidor de dados separado, canal interno HMAC, armazenamento cifrado de pedidos, controle de estoque, rastreamento, headers de segurança, documentação de deploy/backup, CI e testes. O README declara expressamente que checkout ainda gera pré-pedido, sem cobrança; frete e cupons são demonstrativos; catálogo/estoque têm dados de exemplo. O catálogo ainda deriva de dados estáticos e não há CRUD administrativo integrado.

**Bloqueios:** catálogo persistente como fonte de verdade; autenticação humana e autorização granular do admin; reserva de estoque durável/transacional; preço/cupom/frete validados no servidor; gateway e webhooks reais; logística real ou regra comercial explícita; privacidade/LGPD operacional; infraestrutura e recuperação comprovadas.

### Painel — `lola_site_admin`
A aplicação é uma interface React/Vite com seed e persistência em `localStorage`. Produtos, fotos, preços, estoque e exclusões afetam somente o navegador. Pedidos, clientes, relatórios e configurações são telas demonstrativas/placeholder. Não há cliente API, login/sessão, RBAC, MFA ou auditoria remota.

**Bloqueios:** autenticação e autorização no servidor da loja; integração HTTP tipada; remoção do localStorage como fonte de verdade; estados de carregamento/erro/salvamento; CRUD real; uploads persistentes; telas reais para pedidos/clientes/relatórios/configurações; testes e deploy separado.

### Decisão arquitetural
- A loja pública nunca recebe segredo administrativo, chave AES ou segredo HMAC.
- O browser do painel fala apenas com endpoints administrativos autenticados por sessão humana.
- O backend do painel valida cada ação e chama o plano de dados; HMAC permanece exclusivamente serviço-a-serviço.
- O servidor de dados não deve ficar publicamente exposto. Preferir rede privada; se a topologia exigir acesso externo, usar proxy/API controlada, firewall e autenticação robusta.
- Catálogo, preço, disponibilidade, pedidos e estado de pagamento têm autoridade no backend.
- Não usar localStorage como persistência comercial ou mecanismo de autorização.
- Não presumir que hosting estático, CDN ou localização da CDN signifique que API e dados estejam no Brasil.

## 2. Ordem de execução obrigatória

| Ordem | Fase | Dependência | Saída verificável |
|---|---|---|---|
| 0 | Congelar baseline e mapear contratos | Nenhuma | branches/PRs, inventário de rotas, schemas, fluxos e riscos |
| 1 | Segurança e modelo de acesso | Fase 0 | login, sessões, CSRF, RBAC, auditoria e testes negativos |
| 2 | Persistência e modelo de domínio | Fase 0 | catálogo e reservas duráveis; migração/reconciliação |
| 3 | Contrato API e integração | Fases 1 e 2 | endpoints versionados, DTOs, cliente API e erros padronizados |
| 4 | Operação de catálogo/imagens | Fases 1–3 | CRUD real e publicação consistente na vitrine |
| 5 | Estoque e pedidos | Fases 1–4 | reserva/baixa/liberação idempotentes e fluxo testado |
| 6 | Pagamento e entrega | Fases 1–5 + decisões externas | PSP/webhooks e cotação/rastreio reais ou regras declaradas |
| 7 | Clientes, relatórios e automações | Fases 1–6 | telas com acesso mínimo e dados agregados |
| 8 | LGPD, conteúdo e experiência | Em paralelo, validar antes do lançamento | políticas, consentimento, acessibilidade, SEO e suporte |
| 9 | Infraestrutura, observabilidade e DR | Fases 1–8 | ambiente protegido, backup restaurado, alertas e rollback |
| 10 | QA, segurança e go-live | Todas | evidências, aceite, plano de reversão e autorização de publicação |

**Não inverter:** não conectar o painel antes de existir autenticação e contrato estável; não habilitar checkout pago antes de estoque, preço, pedido, idempotência e webhook; não anunciar frete cotado sem integração ou regra real.

## 3. Backlog completo por domínio

### A. Governança, produto e ambiente
- [ ] Confirmar escopo comercial: venda de produtos próprios, regiões atendidas, horários, política de entrega, retirada, trocas e suporte.
- [ ] Definir responsáveis e contas de titularidade; mínimo de dois administradores de recuperação.
- [ ] Manter branches de integração e PRs draft; proteger `main`; exigir CI verde e revisão.
- [ ] Definir ambientes local, teste/staging e produção, com dados separados.
- [ ] Definir configuração por ambiente e validar variáveis obrigatórias na inicialização.
- [ ] Criar inventário de serviços, domínios, DNS, certificados, provedores, custos e limites.
- [ ] Fixar versões suportadas de Node/npm; instalar com lockfile e `npm ci`.
- [ ] Definir política de releases, tags, changelog e rollback.
- [ ] Não usar dados reais em desenvolvimento/testes; gerar fixtures sintéticas.

### B. Arquitetura e dados
- [ ] Desenhar C4/contexto, componentes, sequência de checkout, pagamento, estoque e administração.
- [ ] Definir fonte única para produto, SKU, preço, promoção, categoria, mídia e publicação.
- [ ] Criar modelo persistente com IDs estáveis, datas UTC, moeda BRL em centavos inteiros e constraints.
- [ ] Definir migrations versionadas, backup pré-migration e procedimento de rollback/forward-fix.
- [ ] Migrar catálogo estático para dados persistentes com importação idempotente e relatório de divergências.
- [ ] Criar repositórios/serviços de domínio separados dos handlers HTTP.
- [ ] Definir DTOs allowlist para público, cliente autenticado, operador e serviço interno.
- [ ] Padronizar paginação, filtros, ordenação, validação, erros e versionamento API.
- [ ] Definir cache, invalidação e consistência após alteração de produto/estoque.
- [ ] Definir integridade referencial, exclusão lógica/arquivamento e retenção.

### C. Identidade, autenticação e autorização
- [ ] Criar contas individuais de operador; nunca compartilhar usuário/senha.
- [ ] Hash de senha com Argon2id ou bcrypt configurado adequadamente; nunca armazenar senha reversível.
- [ ] MFA obrigatório para administradores; fluxo seguro de recuperação e códigos de backup.
- [ ] Sessões opacas, aleatórias, armazenadas no servidor, revogáveis e com expiração ociosa/absoluta.
- [ ] Cookies `HttpOnly; Secure; SameSite` e escopo restrito; não armazenar token em localStorage.
- [ ] Proteção CSRF para operações autenticadas por cookie; validar Origin/Referer e token anti-CSRF.
- [ ] Rate limit de login, recuperação, MFA e endpoints sensíveis; atraso progressivo e alertas sem permitir DoS fácil.
- [ ] RBAC/permissionamento server-side: `catalog:read/write/publish`, `inventory:read/adjust`, `orders:read/update`, `customers:read/export`, `reports:read`, `settings:write`, `users:manage`, `audit:read`.
- [ ] Princípio do menor privilégio; negar por padrão; verificar autorização em cada recurso e ação.
- [ ] Impedir IDOR/BOLA, elevação de privilégio, mass assignment e troca de tenant/owner.
- [ ] Logout revoga sessão no servidor; revogar todas as sessões ao reset de senha, desligamento ou incidente.
- [ ] Registrar login, falha, MFA, logout, criação/alteração de usuário e alterações privilegiadas.
- [ ] Separar autenticação humana do HMAC de serviço; nenhum segredo interno no bundle do painel.

### D. Segurança de aplicação e infraestrutura
- [ ] Revisar threat model e trust boundaries; preservar HMAC, timestamp, nonce, anti-replay e assinatura de resposta.
- [ ] Servidor de dados em rede privada; sem porta pública; firewall restritivo e allowlist real.
- [ ] Revisar IP real atrás de proxy; confiar somente em proxies explicitamente configurados; ignorar cabeçalho forjado.
- [ ] TLS moderno entre browser/API e, quando atravessar host/rede, entre serviços.
- [ ] Revisar CORS com origem exata do painel; nunca `*` com credenciais.
- [ ] CSP, HSTS, nosniff, frame-ancestors, Referrer-Policy e Permissions-Policy adequados.
- [ ] Proteção contra XSS, CSRF, SSRF, injection, path traversal, prototype pollution, open redirect e request smuggling.
- [ ] Limites de corpo, upload, timeout, concorrência, paginação e consumo de recursos.
- [ ] Rate limit compartilhado se houver múltiplas instâncias; o Map local não é proteção distribuída.
- [ ] Segredos fora do Git, frontend, logs, imagens Docker e artefatos; rotação e plano de comprometimento.
- [ ] Criptografia em trânsito e em repouso; gestão/rotação de chaves; testar recuperação da chave.
- [ ] Permissões mínimas de filesystem/container; usuário não-root; filesystem somente leitura quando possível.
- [ ] Dependabot/auditoria npm, CodeQL, secret scanning, SBOM e revisão de licença/CVEs.
- [ ] Pin de actions/imagens e cadeia de suprimentos; não executar scripts de terceiros sem revisão.
- [ ] Não registrar senha, token, cookie, segredo, número completo de cartão ou PII desnecessária.
- [ ] Logs com redaction, retenção e acesso restrito; não revelar stack trace ao público.

### E. Catálogo e conteúdo
- [ ] CRUD real: nome, slug, descrição, categoria, SKU, material, cor, dimensões, preço, preço promocional, status, destaque, SEO e galeria.
- [ ] Validar SKU único, preço não negativo, promoção válida, slug único e campos obrigatórios.
- [ ] Rascunho/publicado/arquivado com transições permitidas e publicação explícita.
- [ ] Histórico de preço e operador responsável; não sobrescrever auditoria.
- [ ] Categoria e ordenação persistentes.
- [ ] Vitrine lê catálogo pela API/fonte autoritativa, com cache invalidado após mudança.
- [ ] Imagens: upload multipart, MIME real/assinatura do arquivo, extensão allowlist, tamanho/pixel limit, re-encode, remoção de EXIF, nome aleatório e armazenamento persistente.
- [ ] Evitar SVG arbitrário e arquivos executáveis; servir mídia em origem isolada quando possível.
- [ ] Gerar thumbnails e formatos otimizados; alt text e dimensões.
- [ ] Exclusão lógica; bloquear exclusão de produto referenciado por pedido; preservar snapshot histórico.
- [ ] Busca, filtros, ordenação e paginação com limites server-side.
- [ ] Importação/exportação com validação, escaping de CSV e trilha de auditoria.

### F. Estoque
- [ ] Definir estoque físico, reservado, disponível, avariado e estoque mínimo.
- [ ] Disponível = físico - reservado - bloqueado; nunca expor saldo exato publicamente se não necessário.
- [ ] Movimentações imutáveis: entrada, ajuste, reserva, baixa, cancelamento, devolução e perda.
- [ ] Toda correção exige motivo e operador.
- [ ] Reservas persistidas e transacionais; expiração e liberação processadas com segurança.
- [ ] Atomicidade/lock para compras concorrentes; impedir saldo negativo e overselling.
- [ ] Idempotência em reserva, baixa e liberação; reconciliar reservas no boot.
- [ ] Ajuste em lote transacional ou resultado por item explicitamente reportado.
- [ ] Alertas de estoque baixo/zerado e divergência de inventário.
- [ ] Testes com última unidade, carrinho concorrente, timeout, reinício e falha entre gravações.

### G. Carrinho, checkout e pedidos
- [ ] Carrinho local é conveniência; servidor recalcula tudo.
- [ ] Checkout recebe apenas IDs/quantidades e dados necessários; ignora preço, desconto, frete, papel e status enviados pelo browser.
- [ ] Validar publicação, preço vigente, quantidade, limite por pedido, cupom, endereço e cobertura.
- [ ] Recalcular subtotal, descontos, frete e total no backend em centavos inteiros.
- [ ] Snapshot imutável de nome/SKU/preço/desconto/frete no pedido para histórico.
- [ ] Máquina de estados explícita e transições válidas; cliente não define estados internos.
- [ ] Idempotency-Key para criação de pedido e ações repetíveis.
- [ ] Vincular consulta de pedido à sessão/prova de posse; ID ou número isolado não autoriza acesso.
- [ ] Separar pré-pedido, aguardando pagamento, pago, em separação, enviado, entregue, cancelado, estornado e falha.
- [ ] Cancelamento, expiração e devolução liberam/ajustam estoque corretamente.
- [ ] Notificações sem PII desnecessária e sem expor tokens de rastreio.
- [ ] Tratar timeout e indisponibilidade sem criar pedidos duplicados ou confirmar venda indevidamente.

### H. Pagamentos
- [ ] Escolher PSP somente após decisão do responsável; avaliar taxas, Pix, cartão, chargeback, suporte, webhooks e disponibilidade.
- [ ] Nunca receber, armazenar ou registrar PAN/CVV; usar checkout/tokenização hospedada do PSP.
- [ ] Credenciais só no servidor e segregadas por ambiente.
- [ ] Criar intenção/cobrança vinculada ao pedido e idempotência.
- [ ] Verificar assinatura/autenticidade do webhook, timestamp, replay e evento duplicado.
- [ ] Não confiar em redirect/front-end como prova de pagamento.
- [ ] Máquina de estados financeira independente do status logístico.
- [ ] Conciliação PSP x pedidos; estorno, reembolso, expiração, chargeback e divergência.
- [ ] Logs e auditoria sem dados sensíveis.
- [ ] Enquanto não houver PSP real, manter aviso claro: sem cobrança online; não marcar pedido como pago.

### I. Frete, entrega e rastreamento
- [ ] Definir CEPs atendidos, regiões, prazo, custo, retirada e restrições.
- [ ] Se usar tabela fixa, documentar regra e exibir como valor fixo estimado; não chamar de cotação Correios.
- [ ] Se integrar transportadora/Correios, validar contrato, credenciais, timeout, fallback e atualização de prazo.
- [ ] Recalcular frete no servidor; impedir manipulação do total.
- [ ] Validar CEP e número; não confiar apenas no ViaCEP para endereço final.
- [ ] Rastreio por token aleatório forte, expiração/revogação quando aplicável e resposta mínima sem PII.
- [ ] Atualizações logísticas autenticadas; histórico imutável e idempotente.
- [ ] Definir embalagem, despacho, atraso, entrega sem sucesso e extravio.
- [ ] Notificações com opt-in e preferência do cliente.

### J. Clientes, privacidade e LGPD
- [ ] Definir controlador, operador, encarregado/canal de privacidade e finalidade de cada dado.
- [ ] Mapear dados coletados, base legal, retenção, compartilhamento e fluxo internacional.
- [ ] Política de privacidade, termos, cookies quando aplicável e informação clara no checkout.
- [ ] Minimização de dados; evitar conta obrigatória se compra como convidado for suficiente.
- [ ] Acesso de operador a dados pessoais por função e necessidade; mascarar por padrão.
- [ ] Solicitações de acesso, correção, portabilidade, anonimização e eliminação conforme obrigações legais.
- [ ] Retenção fiscal/contábil e bloqueio de eliminação quando houver obrigação legítima.
- [ ] Exportação segura, trilha de acesso e prevenção de scraping.
- [ ] Criptografia, backups e descarte seguro.
- [ ] Avaliar Gemini/IA: não enviar pedidos/PII sem necessidade, base legal, transparência e avaliação de transferência internacional.
- [ ] Plano de incidente e avaliação de notificação à ANPD/titulares conforme aplicável.

### K. Painel e experiência operacional
- [ ] Login, MFA, sessão, troca de senha, recuperação, perfil e logout.
- [ ] Layout com navegação por permissão; esconder não substitui bloqueio backend.
- [ ] Dashboard com métricas reais, período, timezone e indicação de atualização.
- [ ] Produtos: busca, filtros, paginação, CRUD, publicação, mídia, histórico e confirmação.
- [ ] Estoque: saldo permitido, movimentos, ajuste com motivo, baixa, reserva e alertas.
- [ ] Pedidos: lista, filtros, detalhe, timeline, impressão/etiqueta e transições permitidas.
- [ ] Clientes: consulta minimizada, mascaramento, histórico autorizado e exportação restrita.
- [ ] Relatórios: receita líquida/bruta claramente definida, pedidos, ticket médio, cancelamentos e estoque; agregação server-side.
- [ ] Configurações: dados da loja, frete, horários, políticas, integrações e usuários; validação e auditoria.
- [ ] Estados loading/empty/error/offline; não mostrar sucesso antes da confirmação do servidor.
- [ ] Preservar formulários em falha de rede; evitar duplo clique e concorrência.
- [ ] Acessibilidade por teclado, foco, labels, contraste, leitor de tela e responsividade.
- [ ] Remover seed/localStorage como verdade; manter apenas cache transitório não sensível se necessário.
- [ ] CSV protegido contra formula injection; exportações autorizadas e auditadas.

### L. Assistente virtual
- [ ] Definir escopo: FAQ/produtos/políticas; não permitir operação administrativa autônoma.
- [ ] Responder com base em catálogo e políticas atuais, indicando indisponibilidade quando não souber.
- [ ] Não enviar dados de clientes/pedidos a modelo externo sem base legal e minimização.
- [ ] Chave do provedor somente no backend; quotas, limites, timeout e rate limit.
- [ ] Defesa contra prompt injection em descrições, reviews e conteúdo externo.
- [ ] Não permitir que o assistente altere preço, estoque, pedido, pagamento ou dados sem fluxo autorizado.
- [ ] Fallback sem IA e monitoramento de custo/abuso.

### M. Testes e qualidade
- [ ] Unitários para validação, domínio, preço, cupom, estoque, transições e autorização.
- [ ] Integração com banco/armazenamento real em ambiente isolado.
- [ ] Contrato API e compatibilidade entre painel e backend.
- [ ] E2E: navegação, busca, produto, carrinho, checkout, pedido, login admin, CRUD, upload, estoque e pedido.
- [ ] Segurança negativa: anônimo, cliente comum, operador sem permissão, sessão expirada/revogada, CSRF, CORS, IDOR/BOLA, mass assignment.
- [ ] Testes de abuso: brute force, enumeração, scraping, upload malicioso, payload excessivo, SSRF, XSS, SQL/NoSQL injection.
- [ ] Concorrência: última unidade, pedido duplicado, webhook duplicado, cancelamento simultâneo e ajuste em lote.
- [ ] Resiliência: indisponibilidade do PSP, timeout de dados, falha parcial, restart, disco cheio e perda de conexão.
- [ ] Backup/restore, migração, rotação de chaves e recuperação de desastre.
- [ ] A11y automatizada e manual; navegadores/dispositivos reais.
- [ ] Cobertura de testes como indicador, não substituto de cenários críticos.
- [ ] CI bloqueia merge se lint, testes, build, auditoria crítica ou contrato falhar.
- [ ] Testes dinâmicos apenas em staging autorizado, nunca contra cliente/produção sem plano.

### N. Performance, escala e disponibilidade
- [ ] Medir baseline e definir SLO de disponibilidade, latência p95/p99 e taxa de erro.
- [ ] Testar carga gradual com cenários realistas; separar throughput de usuário simultâneo.
- [ ] Cache para catálogo/imagens; CDN sem cache de dados privados.
- [ ] Paginação e índices; consultas sem N+1 e sem varredura completa.
- [ ] Pool/conexões, limites de CPU/memória/disco e filas quando necessário.
- [ ] Backpressure, timeouts, circuit breaker e retries com jitter apenas para operações idempotentes.
- [ ] Health/readiness/liveness separados; não revelar detalhes internos.
- [ ] Escala horizontal somente com sessões, rate limit, estoque e dados compartilhados persistentes.
- [ ] Testar picos de campanha, importação, imagens e webhook.
- [ ] Não prometer capacidade sem teste e ambiente equivalentes à produção.

### O. Observabilidade e operação
- [ ] Logs estruturados com correlation/request ID e redaction.
- [ ] Métricas de latência, erro, throughput, filas, estoque, pedidos, pagamentos e webhooks.
- [ ] Alertas para falha de login, erro 5xx, pagamento divergente, estoque negativo, backup falho e disco alto.
- [ ] Painel operacional sem dados pessoais desnecessários.
- [ ] Runbooks para indisponibilidade, suspeita de invasão, vazamento, falha de PSP, restore e rollback.
- [ ] Definir on-call/responsável, canal de incidente e severidades.
- [ ] Revisar logs e alertas periodicamente; retenção compatível com LGPD.

### P. Infraestrutura, deploy, backup e continuidade
- [ ] Validar região e limites do provedor; confirmar custo zero de verdade e política de suspensão.
- [ ] Separar frontend público, painel privado e API; dados privados em rede/volume privado.
- [ ] TLS, DNS, firewall, proxy e headers validados externamente.
- [ ] Containers non-root, healthcheck, limites, volumes persistentes e imagens reproduzíveis.
- [ ] Deploy imutável, health check antes de tráfego e rollback comprovado.
- [ ] Backup automático criptografado, cópia fora do host e retenção definida.
- [ ] Teste periódico de restore com verificação de integridade e RPO/RTO definidos.
- [ ] Chaves de criptografia fora do backup e armazenadas com recuperação controlada.
- [ ] Testar rotação sem perda de dados.
- [ ] Plano de perda de região/conta, indisponibilidade e comprometimento de credenciais.
- [ ] Não considerar deploy pronto só porque container iniciou.

### Q. SEO, acessibilidade, conteúdo e comercial
- [ ] Metadados por produto/categoria, canonical, sitemap, robots e Open Graph.
- [ ] Dados estruturados Product/Offer somente quando preço/estoque forem reais.
- [ ] Otimização de imagem, Core Web Vitals e carregamento mobile.
- [ ] Conteúdo verdadeiro sobre material, garantia, conservação, medidas e disponibilidade.
- [ ] Política de troca/devolução, prazo, entrega, atendimento, termos e privacidade revisados.
- [ ] Preços e promoções com vigência e condições transparentes.
- [ ] Checkout acessível, mensagens de erro compreensíveis e confirmação por canal escolhido.
- [ ] Revisão jurídica/comercial antes de publicar.

## 4. Matriz de acesso mínima

| Recurso | Público | Cliente dono | Operador catálogo | Operador pedidos | Admin |
|---|---|---|---|---|---|
| Catálogo publicado | Ler | Ler | Ler/escrever | Ler | Total |
| Saldo interno | Não | Não | Conforme necessidade | Conforme necessidade | Total |
| Pedido | Não listar | Próprio e minimizado | Não | Ler/atualizar fluxo | Total auditado |
| PII de cliente | Não | Própria | Não | Mínimo necessário | Justificado/auditado |
| Preço/cupom/frete | Não alterar | Não alterar | Configurar conforme permissão | Não | Total |
| Pagamento | Não | Próprio estado resumido | Não | Consultar estado | Acesso restrito |
| Usuários/permissões | Não | Não | Não | Não | Gerenciar |
| Segredos, backups, logs internos | Nunca | Nunca | Nunca | Nunca | Nunca via painel |

## 5. Critérios de bloqueio de lançamento (NO-GO)

Qualquer item abaixo reprova o lançamento:
- painel acessível sem autenticação/MFA ou com segredo no bundle;
- cliente comum consegue ler pedido alheio ou executar operação administrativa;
- preço, desconto, frete ou status são confiados ao navegador;
- estoque pode ficar negativo ou ser vendido duas vezes;
- pagamento pode ser marcado como confirmado sem webhook verificado;
- PII aparece em endpoints públicos, logs ou rastreamento;
- servidor de dados/admin está exposto sem controle de rede;
- backup não foi restaurado com sucesso;
- não há rollback testado;
- políticas e informações comerciais essenciais estão ausentes;
- CI/testes críticos falham ou não há evidência de execução.

## 6. Evidências exigidas para cada fase
Para cada tarefa registrar: ID, risco, arquivos alterados, commit/PR, teste executado, resultado, evidência/log, dependência, responsável e status. Status permitidos: **Não iniciado**, **Em análise**, **Em implementação**, **Bloqueado**, **Implementado**, **Validado**. Só marcar Validado com teste reproduzível e evidência.

## 7. Decisões externas que não devem ser inventadas
- Conta/provedor e região efetivamente disponível no Brasil.
- Domínio/DNS e acesso à hospedagem.
- PSP escolhido e credenciais.
- Transportadora/Correios e credenciais, ou aprovação de tabela fixa.
- Dados legais do controlador e políticas comerciais.
- Canal oficial de suporte e contatos.
- Consentimento/decisão sobre IA e transferência internacional.
- Orçamento: nenhum serviço pago deve ser contratado ou ativado sem autorização.

## 8. Próxima execução técnica
1. Fechar inventário de código/rotas/schema e baseline de CI dos dois repositórios.
2. Implementar autenticação humana, sessão, CSRF, RBAC e auditoria no backend da loja.
3. Tornar catálogo e reservas persistentes e autoritativos.
4. Publicar contrato API administrativo versionado e testes de autorização.
5. Integrar painel por cliente HTTP; remover operações locais como fonte de verdade.
6. Implementar catálogo/imagens e depois estoque/pedidos.
7. Só então pagamento, entrega, clientes, relatórios e assistente.
8. Fazer auditoria dinâmica, restore drill, teste de carga e checklist de go-live.

**Estado desta análise:** planejamento consolidado com base na inspeção estática disponível. Não é certificado de segurança, não comprova infraestrutura, não implementa os itens e não autoriza lançamento.
