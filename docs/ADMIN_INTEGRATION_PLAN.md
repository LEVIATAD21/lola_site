# Integração de produção do painel administrativo

## Objetivo

Fazer o painel `lola_site_admin` administrar os dados reais consumidos pela loja `lola_site`. Alterações feitas no painel devem ser persistidas no servidor e refletidas na vitrine; `localStorage` e dados fictícios não são fonte de verdade.

## Estado verificado antes da implementação

- O painel atual é uma interface demonstrativa e persiste no navegador (`localStorage`).
- O README do painel confirma que produtos, fotos, preços e exclusões não chegam à API.
- A loja usa `src/data/mockData.ts` como catálogo autoritativo; `src/server/catalog.ts` deriva os dados usados no cálculo de pedidos dessa fonte.
- A loja já possui separação entre vitrine e plano de dados (`server.ts` / `data-server.ts`), assinatura HMAC no canal interno e rotas administrativas para estoque, pré-pedidos e rastreamento.
- As rotas administrativas atuais usam chave de servidor e allowlist de origem. Não são uma sessão web adequada para expor diretamente ao navegador.
- O checkout ainda não tem gateway de pagamento. Não anunciar cobrança online até integrar e testar um PSP.

## Arquitetura alvo com custo zero

1. **Vitrine:** build estático da loja servido por hospedagem gratuita com CDN.
2. **Painel:** build estático independente, também em hospedagem gratuita.
3. **API/plano de dados:** processo Node no servidor gratuito em São Paulo, se a Oracle Always Free disponibilizar capacidade na região da conta.
4. **Persistência:** pedidos e rastreamento já usam arquivos cifrados com AES-256-GCM; estoque e pré-reservas usam arquivos JSON separados, com permissões restritas e gravação atômica, mas **não estão cifrados em nível de aplicação**. Proteger o volume e os backups com criptografia do host/armazenamento; não descrever o estoque como cifrado. Não migrar para PostgreSQL sem plano de migração, testes e compatibilidade.
5. **Segredos:** chaves apenas no ambiente do servidor. Nunca usar variáveis `VITE_*` para segredos.
6. **Rede:** API administrativa atrás de HTTPS; o navegador autentica com sessão segura. A chave HMAC interna continua exclusivamente entre servidores.
7. **Sem fallback pago:** se não houver capacidade gratuita no Brasil, manter publicação bloqueada e informar a limitação; não contratar plano pago.

A CDN pode entregar arquivos por pontos de presença brasileiros, mas isso não significa que os dados dinâmicos estejam no Brasil. O servidor de API e os volumes persistentes devem estar na região brasileira escolhida.

## Requisitos obrigatórios do painel

- Login administrativo real, sessão revogável e cookies HttpOnly/Secure/SameSite.
- Proteção CSRF para operações autenticadas por cookie, rate limit e trilha de auditoria.
- CRUD de produtos: nome, descrição, categoria, preço, preço promocional, SKU, material, cor, imagem, publicação e destaque.
- Upload de imagens com validação de MIME real, limite de tamanho, nomes aleatórios e armazenamento persistente.
- Estoque: leitura e ajuste auditável; não permitir saldo negativo.
- Pedidos: listar, consultar e atualizar apenas estados permitidos; não inventar estado de pagamento.
- Clientes: acesso mínimo necessário, mascaramento e controles LGPD.
- Configurações da loja, promoções e frete apenas quando suportados pelo backend.
- A vitrine e o cálculo do pedido devem ler a mesma fonte autoritativa de catálogo/preço.
- Operações em lote devem ser transacionais ou explicitamente atômicas; erros parciais devem ser reportados.

## Contrato inicial da API

Prefixo: `/api/admin/v1`

| Método | Caminho | Finalidade |
|---|---|---|
| POST | `/auth/login` | Criar sessão administrativa |
| POST | `/auth/logout` | Revogar sessão |
| GET | `/auth/session` | Consultar sessão atual |
| GET | `/products` | Listar catálogo real |
| POST | `/products` | Criar produto |
| GET | `/products/:id` | Consultar produto |
| PATCH | `/products/:id` | Editar produto |
| POST | `/products/:id/image` | Enviar imagem |
| POST | `/products/:id/archive` | Arquivar produto |
| GET | `/orders` | Listar pedidos/pré-pedidos |
| PATCH | `/orders/:id/status` | Atualizar status operacional permitido |
| GET | `/inventory` | Consultar estoque |
| PATCH | `/inventory/:productId` | Ajustar estoque com motivo |
| GET | `/audit-log` | Consultar auditoria |

Este contrato é uma especificação, não afirma que os endpoints já estejam implementados.

## Sequência de implementação

1. Criar armazenamento persistente de catálogo e migração inicial determinística a partir do catálogo atual.
2. Adaptar o plano de dados local e HTTP para ler/escrever o catálogo na autoridade de dados.
3. Garantir que a vitrine e a validação/preço do checkout leiam a mesma versão do catálogo.
4. Implementar autenticação de operador no servidor de dados, sem enviar chave administrativa interna ao browser. A chave administrativa atual é compartilhada e não substitui identidade humana; HMAC permanece somente no canal serviço-a-serviço.
5. Implementar CRUD, uploads e auditoria com testes unitários e de integração.
6. Integrar o painel ao cliente HTTP autenticado; remover `seed` e `localStorage` como fonte de verdade.
7. Testar o modo dividido, reinício, backup/restore, concorrência de estoque, autorização e falhas de rede.
8. Preparar deploy e só habilitar publicação após credenciais/contas gratuitas configuradas e health checks aprovados.

## Bloqueios que exigem dados/decisão do responsável

- Conta Oracle e disponibilidade de VM Always Free na região São Paulo.
- Conta Cloudflare e autorização de conexão com os dois repositórios.
- Dados legais do controlador para Termos e Política de Privacidade.
- Decisão sobre assistente Gemini e consentimento para transferência internacional.
- Canal oficial de atendimento.
- Decisão de PSP e credenciais para pagamentos online. Sem isso, manter aviso de que a loja não cobra online.
- Decisão sobre tabela fixa de frete ou integração logística real.

## Critérios de aceite

- Alterar o preço no painel persiste após logout, reinício do servidor e novo acesso.
- A vitrine apresenta o novo preço e o checkout calcula exatamente o mesmo preço no servidor.
- Uma imagem enviada permanece após reinício e é servida pela URL persistente.
- Operador não autenticado não lê nem altera dados administrativos.
- Nenhuma chave interna aparece no bundle do painel, logs públicos ou respostas HTTP.
- Ajustes concorrentes de estoque não geram saldo negativo nem overselling.
- Backups são restaurados em ambiente isolado e validados.
- Deploy falho não substitui a versão saudável; rollback documentado e testado.
