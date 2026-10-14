# Fluxo de dados pessoais — mapa do encarregado (LGPD)

**Projeto:** LOLA Aço Inox & Acessórios · semijoias em aço inox · pt-BR
**Escopo legal:** Lei 13.709/2018 (LGPD)
**Papel deste documento:** ser a ficha que o operador abre quando um titular pede
informação sobre os próprios dados. Não é a política de privacidade pública (esta
precisa ser publicada com identificação do controlador e do encarregado — ver §9).

**Como ler:** toda afirmação traz `arquivo:linha`. Onde a linha não vem de código,
digo de onde vem. Onde a resposta honesta é "não existe", está escrito
**NÃO EXISTE** — não há texto neste documento que finja capacidade que o sistema
não tem.

---

## 0. Mapa de ponta a ponta

```
   NAVEGADOR (visitante)                        SERVIDOR                  SERVIDOR DE DADOS
   ─────────────────────                        ────────                  ─────────────────
   [1] checkout ─── POST /api/pedidos/rascunho ─▶ server.ts:296 ─────────▶ /internal/pedidos
                                                                                   │
   [2] chat ────── POST /api/ai/consulta ───────▶ server.ts:360            buildOrderDraft
                                                                                   │
   [3] CEP ─────── GET viacep.com.br/ws/... ◀──── (direto, fora da LOLA)    placeHold (RAM)
              (src/services/cep.ts:18)                                         │
                                                                              ▼
   [4] IP ──────── log de requisição ───────────▶ logger.ts:152          .data/orders.enc.json
                                                                     AES-256-GCM + AAD
   [5] localStorage ◀──▶ carrinho/favoritos                                (90 dias de purga)
        (navegador só)

   [6] Google Fonts ◀── index.html:12-14 (IP do visitante sai daqui)
```

Três coisas que o mapa já responde:

* o dado pessoal de checkout **sai do navegador** e vai para o servidor — ele não
  fica só no cliente;
* o servidor público pode **não ter** o dado: no modo dividido ele só encaminha
  (`server.ts:112-124`), quem persiste é o `data-server.ts`;
* nenhum dos cinco fluxos passa por cookie, pixel ou analytics — **não existe
  rastreamento neste projeto** (§5).

---

## 1. Inventário — o que entra

### 1.1 Checkout (`POST /api/pedidos/rascunho`)

Entrada: formulário de entrega (`CheckoutAddressForm.tsx`), montado em
`CheckoutPage.tsx:186-208` e enviado por `src/services/api.ts:203-207`.
Rota: `server.ts:296-305` → `plane.createDraft(req.body, { ip: req.ip })`
(`server.ts:300`) → `src/server/dataPlane.ts:75`.

| Campo | Formulário | Validação no servidor | Grava em | `arquivo:linha` |
|---|---|---|---|---|
| `fullName` — nome completo | `CheckoutAddressForm.tsx:101` | 3–120 chars, sem `<`/`>` | `.data/orders.enc.json` | `orders.ts:138`, montagem `orders.ts:265` |
| `phone` — telefone | `CheckoutAddressForm.tsx:118` | só dígitos, 10–11 | idem + **vira índice de busca** | `orders.ts:145,151`; índice `orders.ts:448` |
| `cep` — CEP | `CheckoutAddressForm.tsx:140` | 8 dígitos, faixa real, sem sequência degenerada | idem | `orders.ts:146,152`, `isValidCep` `orders.ts:94-99` |
| `street` — logradouro | preenchido pelo ViaCEP | 5–180 chars | idem | `orders.ts:139` |
| `number` — número | `CheckoutAddressForm.tsx:195` | 1–20 chars | idem | `orders.ts:140` |
| `complement` — complemento | `CheckoutAddressForm.tsx:211` | **texto livre**, 120 chars, opcional | idem | `orders.ts:143` |
| `neighborhood` — bairro | `CheckoutAddressForm.tsx:225` | 1–100 chars | idem | `orders.ts:141` |
| `city` — cidade | `CheckoutAddressForm.tsx:246` | 1–100 chars | idem | `orders.ts:142` |
| `state` — UF | `CheckoutAddressForm.tsx:266` | 2 letras, na lista das 27 UF | idem | `orders.ts:144,153` |
| `paymentMethod` — `pix`/`boleto` | `CheckoutPaymentMethod.tsx` | enum fechado; `credit_card` **recusado** | idem | `orders.ts:80,158`, recusa `orders.ts:155-157` |
| `items` — 1 a 30 linhas | sacola | produto precisa existir no catálogo; preço vem do servidor | idem | `orders.ts:181-221` |
| `shippingOptionId` — frete | carrinho | enum `pac`/`sedex`/`transportadora` | idem | `orders.ts:81,163-167` |
| `couponCode` — cupom | carrinho | existe + validade + mínimo + teto de usos | idem | `orders.ts:169-179,229-238` |
| `giftWrap` — embalagem (bool) | sacola | **só o booleano é aceito; grava `giftWrapCents`** | idem | bool `orders.ts:161`; centavos `orders.ts:248` |
| `termsAccepted` | `CheckoutPaymentMethod.tsx:182-232` | tem de ser `true` | idem | `orders.ts:154` |
| `orderNumber` | — (gerado) | identificador de negócio | cifrado + **log em claro** | geração `orders.ts:257`; log `dataPlane.ts:120-122` |

**`complement` é o único campo em que a cliente digita dado pessoal de terceiro**
(endereço da mãe, telefone de quem recebe). É por isso que limita a 120
caracteres e recusa marcação (`orders.ts:101-109`), e é por isso que a política de
privacidade precisa dizer que o endereço é fornecido pela própria cliente
(`orders.ts:27-32`).

**Checkbox "Salvar este endereço para próximas compras"** (`CheckoutAddressForm.tsx:292`)
— existe na tela, mas `saveAddress` **não sai do navegador**: não entra no payload
(`CheckoutPage.tsx:186-208`) e não vai para `localStorage`. Endereço nenhum é
guardado entre compras. O estado é `CheckoutPage.tsx:77` e morre no reload.

### 1.2 Chat — Assistente Virtual (`POST /api/ai/consulta`)

Entrada: `ChatbotAssistente.tsx:89-92` → `src/services/api.ts:119-123`.
Rota: `server.ts:360-540`.

| O que sai do navegador | Limite | `arquivo:linha` |
|---|---|---|
| `pergunta` — texto digitado pela cliente | 1200 caracteres | `server.ts:362,370-372` |
| `contexto.produtoId` — produto que está vendo | 120 chars, e só o id (o resto é reconstruído do catálogo) | `server.ts:389-392` |
| `contexto.carrinho` — itens da sacola | 30 itens, id + nome + quantidade | `server.ts:393-407` |
| Histórico da conversa | fica **só em estado React** no navegador (`Message[]`, `ChatbotAssistente.tsx:33-43`) | não persiste em `localStorage` nem no servidor |

**Destino:** com `GEMINI_API_KEY` setada, o prompt — que contém a pergunta e o
contexto — vai para a API do Google Gemini (`server.ts:445-454`, chave em
`server.ts:409,412`). Sem chave, nada sai da máquina: um motor local de regras
responde (`server.ts:500-539`).

**O servidor não guarda pergunta nem resposta.** As regras fixas do logger
proíbem registrar corpo de requisição e conteúdo do assistente
(`logger.ts:79-80`).

> **Base legal hoje: NÃO EXISTE de forma válida.** O comentário do código é franco
> — consentimento (art. 7º, I) c/c aviso prévio (art. 9º, I), e "hoje não há aviso
> na UI nem consentimento … esta rota também não pode virar consentimento tácito
> por uso" (`server.ts:349-359`). Isso é o **bloqueio B3** (§9).

### 1.3 CEP — ViaCEP

`src/services/cep.ts:14-44`, chamado por `CheckoutPage.tsx:116`.

* **O que vai:** os 8 dígitos do CEP, em `GET https://viacep.com.br/ws/<cep>/json/`
  (`cep.ts:18`).
* **Quem faz a chamada:** o **navegador da cliente**, não o servidor da LOLA — o
  ViaCEP vê o IP da cliente junto do CEP.
* **O que volta:** logradouro, bairro, cidade, UF (`cep.ts:37-43`), preenchido no
  formulário e depois revisado pela própria cliente (`CheckoutPage.tsx:123-136`).
* **O que não vai:** nome, telefone, número, complemento — nenhum outro campo
  viaja nessa chamada.

### 1.4 IP

| Onde o IP aparece | Como é tratado | `arquivo:linha` |
|---|---|---|
| Log de requisição `/api/*` | mascarado por padrão (`189.45.x.x`) | `logger.ts:152-158`, máscara `logger.ts:46-55` |
| Tentativa administrativa | idem | `logger.ts:173-181` |
| Registro/recusa de pré-pedido | idem | `dataPlane.ts:105-108,114,120-122` |
| Pré-reserva de estoque (dono do hold) | **só memória**, some com a reserva | `dataPlane.ts:95-103`, `inventory.ts:17,44-48` |
| Modo do log | `LOLA_LOG_IP_MODE`, padrão `mask`; opções `full`/`hash`/`off` | `logger.ts:15,21-25`; `.env.example:171` |

* **Mascarar ≠ apagar.** `189.45.x.x` preserva o agregado do provedor e apaga o
  assinante (`logger.ts:46-55`) — reduz o risco, não elimina a retenção.
* **O IP nunca entra no pedido.** O comentário em `orders.ts:44-46` e o payload de
  `buildOrderDraft` (`orders.ts:264-270`) mostram que não há campo de IP no registro.
* **No modo dividido, o data-server nem vê o IP da cliente**: `httpDataPlane.ts:183`
  não encaminha `meta.ip`, então `internalRoutes.ts:112` registra o IP da **vitrine**
  (`data-server.ts:88-91`).
* Query string fica de fora do log de propósito — filtros podem carregar dado
  digitado (`logger.ts:133-136`).

### 1.5 `localStorage` (navegador)

Chaves em `src/App.tsx:63-133`:

| Chave | Conteúdo | Leitura/escrita |
|---|---|---|
| `lola_cart` | itens da sacola (id, produto, nome, imagem, preço, quantidade) | `App.tsx:69,114`; saneador `cartStorage.ts:56-136` |
| `lola_favorites` | ids de produtos favoritos (até 200) | `App.tsx:63,105`; `checkoutStorage.ts:18-35` |
| `lola_coupon` | **só o código** do cupom; percentual é recalculado da tabela oficial | `App.tsx:77,123-124`; `checkoutStorage.ts:41-56` |
| `lola_shipping` | **só o id** do frete (`pac`/`sedex`/`transportadora`) | `App.tsx:81,132-133`; `checkoutStorage.ts:63-74` |

* **Dado mora no dispositivo da cliente**, não no servidor da LOLA — não é dado
  coletado pelo controlador, e a política de cookies já diz isso
  (`SiteFooter.tsx:171`).
* **Nenhum dado pessoal de identificação é gravado lá**: sem nome, telefone,
  endereço, e-mail ou telefone. O saneador descarta qualquer propriedade extra
  (`cartStorage.ts:56-102`).
* Sem cookie de terceiros e sem `document.cookie` de rastreamento no código.

### 1.6 IP do visitante → Google Fonts

`index.html:12-14` carrega CSS e fontes de `fonts.googleapis.com` /
`fonts.gstatic.com`. O navegador da cliente faz a requisição direto para o Google:
**o IP (dado pessoal, art. 5º, I) sai daqui sem aviso na interface.** É vazamento
evitável auto-hospedando as fontes — hoje não está feito.

---

## 2. Onde persiste e como

### 2.1 `.data/orders.enc.json` — o único lugar com dado pessoal

* **Cifra:** AES-256-GCM, envelope v2 com IV de 12 bytes e tag de autenticação
  (`orders.ts:610-625`).
* **AAD:** `ORDERS_AAD = 'lola-orders|orders.enc.json'` (`orders.ts:346`) — amarra a
  cifra ao nome do arquivo; um envelope antigo ou de outro diretório não decifra
  (explicação em `orders.ts:334-345`).
* **Chave:** `LOLA_ORDERS_ENCRYPTION_KEY` ou `LOLA_ORDERS_KEY_FILE`
  (`orders.ts:456-479`); em produção, sem chave não há pedido
  (`orders.ts:478-479`). Em desenvolvimento a chave é criada ao lado dos dados, com
  aviso — aceitável só em dev (`orders.ts:504-510`).
* **Permissões:** diretório `0700`, arquivo `0600`, escrita atômica (tmp + rename)
  (`orders.ts:612,621-624`).
* **Teto:** 10.000 registros (`orders.ts:423`) — é teto de espaço, **não** retenção.
* **Volume em memória:** o arquivo inteiro é decifrado no boot e fica em RAM
  (`orders.ts:521-557`); toda gravação reescreve o arquivo inteiro.

### 2.2 `.data/inventory.json` — **sem dado pessoal**

Contadores por produto (`total`, `reservado`, `vendido`, `disponivel`), gravados em
claro (`inventory.ts:98-108`). As pré-reservas (holds) — que carregam o IP como
dono (`inventory.ts:17`) — **não são persistidas**: o mapa de holds é só memória
(`inventory.ts:43-48`).

### 2.3 Logs

* Uma linha por requisição `/api/*`, sem corpo, sem query string, sem cabeçalho de
  autenticação (`logger.ts:79-80,123-158`).
* Campos: `ip` (mascarado), `method`, `path` (truncado em 200 chars), `status`,
  `ms` (`logger.ts:152-158`).
* Volume limitado a 600 linhas/minuto; excedente é suprimido e contado
  (`logger.ts:124,147-150`).
* Eventos de domínio: `pedido.registrado`, `pedido.recusado_por_estoque`,
  `pedido.falha_ao_persistir` (`dataPlane.ts:105-122`),
  `pedidos.expirados_removidos` (`dataPlane.ts:183-188`),
  `pedido.eliminado` / `pedido.anonimizado` (`adminRoutes.ts:115,130`),
  `admin.access` (`logger.ts:173-181`).
* **Destino:** stdout → o que o coletor do hospedador fizer. **Não há política de
  rotação de log declarada neste repositório** (lacuna real, §3 e §9).

### 2.4 No navegador

Só as quatro chaves de `localStorage` da §1.5 e o estado React da conversa
(`ChatbotAssistente.tsx:33-43`).

### 2.5 Só memória, apagado por relógio

| Dado | Vive em | Prazo | `arquivo:linha` |
|---|---|---|---|
| Pré-reserva de estoque + IP dono | `Map` do `InventoryStore` | **30 min** por padrão (`LOLA_RESERVATION_TTL_MS`) | TTL `server.ts:73`, `data-server.ts:83`; mapa `inventory.ts:48`; varredura `dataPlane.ts:195-199` |
| Conversa do chat | estado React | some no reload da aba | `ChatbotAssistente.tsx:33-43` |
| Snapshot de estoque no proxy | `HttpDataPlane` | 5 s / stale 60 s | `server.ts:120-121` |

---

## 3. Por quanto tempo — retenção por finalidade (art. 15, II)

| Finalidade | Dado | Retenção | Mecanismo | `arquivo:linha` |
|---|---|---|---|---|
| Registrar e concluir o pré-pedido | nome, telefone, endereço, itens, cupom, aceite | **90 dias** (`LOLA_ORDER_RETENTION_DAYS`), faixa 0–3650 | `purgeExpired` na subida e **de hora em hora**, reescreve o arquivo com a chave vigente, com rollback se a escrita falhar | `orders.ts:364,373-377,584-608`; agendamento `dataPlane.ts:179-192`; env `server.ts:135`, `data-server.ts:87` |
| Eliminação a pedido do titular (art. 18, VI) | idem | **imediata**, sob demanda | `remove()` apaga o registro; `redact()` apaga só a PII e grava `redactedAt` | `orders.ts:739-754`, `orders.ts:767-788` |
| Segurança/auditoria | IP mascarado, status, path | **não declarada no código** — depende da rotação do SO/coletor | — | `logger.ts:152-158` |
| Reserva de estoque | IP dono + quantidades | **30 min** (TTL), depois expira sozinha | sweep periódico | `server.ts:73`, `dataPlane.ts:195-199`, `inventory.ts:44-48` |
| Dados no navegador | carrinho/favoritos | até a cliente limpar o navegador | `localStorage` | `App.tsx:63-133` |
| Texto do chat | pergunta/resposta | **não guarda no servidor**; se Gemini ativo, passa a valer a retenção do Google | — | `server.ts:79-80` (regra do logger) |

Observações que o operador precisa saber de cor:

* **`0` em `LOLA_ORDER_RETENTION_DAYS` desliga a expiração** — é opt-in explícito e
  desaconselhado, nunca o padrão (`orders.ts:369-377`).
* **Data ilegível expira** (`orders.ts:587-591`): registro corrompido não vira
  eterno.
* **Apagar não depende da chave antiga**: `remove`/`redact` reescrevem com a chave
  vigente (`orders.ts:726-738`). Rotacionar a chave deixa o resto ilegível.
* **A purga falhando não "some" o dado só na RAM**: em erro de escrita a memória é
  restaurada e o evento vira erro de log (`orders.ts:599-607`) — para o operador não
  acreditar que apagou quando não apagou.

---

## 4. Quem mais vê (art. 33 e 39)

| Terceiro | O que recebe | Quando | Onde no código |
|---|---|---|---|
| **Google (Gemini)** | pergunta da cliente, produto visualizado, itens da sacola, mais o catálogo inteiro no prompt | só com `GEMINI_API_KEY` preenchida | `server.ts:409-454`; aviso ausente `server.ts:349-359` |
| **ViaCEP** | 8 dígitos do CEP + IP da cliente (requisição do navegador) | cliente clica em "buscar CEP" | `cep.ts:18`; chamada `CheckoutPage.tsx:116` |
| **Google (Fonts)** | IP do visitante + user-agent (requisição de CSS/fontes) | toda página | `index.html:12-14` |
| **Meta (WhatsApp)** | link com produto e preço **sem PII** — só no clique | cliente decide | `WhatsAppModal.tsx:26` (`wa.me/?text=`) |
| **Hospedagem** | o arquivo `.data/` cifrado e o log com IP mascarado | sempre | `server.ts:126`, `data-server.ts:78` |
| **Transportadora** | endereço — **não acontece hoje**: não há integração de expedição | — | sem rota correspondente |

Quem **não** vê: nenhum terceiro recebe nome/telefone/endereço. O único caminho de
PII para fora da LOLA é o Gemini (B3).

No modo dividido, a PII também atravessa o canal interno vitrine → data-server
(`httpDataPlane.ts:183` → `internalRoutes.ts:112`). A assinatura impede forja e
replay, **não impede leitura**: confidencialidade depende de TLS ou de rede
privada declarada (`internalClient.ts:144-155`, aviso `data-server.ts:174-180`).

---

## 5. O que NUNCA é coletado

Confirmado no código, não é promessa de folheto:

| Item | Por que não entra | `arquivo:linha` |
|---|---|---|
| **Número de cartão, CVV, validade** | não existe campo de cartão na UI (opção desativada); o servidor recusa `credit_card`; campos extras do corpo são descartados por construção — `buildOrderDraft` só copia a lista branca | UI `CheckoutPaymentMethod.tsx:55`; recusa `orders.ts:155-157`; prova `orders.test.ts:94-101` |
| **E-mail** | não há cadastro nem campo de e-mail em lugar nenhum | não há correspondência no código |
| **CPF / RG / documento** | não há campo | idem |
| **Cookies de rastreamento** | nenhum `document.cookie` de terceiro, nenhum pixel | texto em `SiteFooter.tsx:171` |
| **Analytics / tag manager / sessão gravada** | sem GA, GTM, Matomo, Hotjar, Sentry, PostHog no `package.json` nem no `index.html` | varredura sem correspondência |
| **IP dentro do pedido** | não existe campo; IP só em log (mascarado) e em hold de memória | `orders.ts:44-46,264-270` |
| **`giftWrap` (bool)** | só os centavos são gravados | `orders.ts:44,248` |
| **Corpo da requisição em log** | proibido por regra fixa do logger | `logger.ts:79-80` |
| **Chave administrativa / `GEMINI_API_KEY` em log** | proibido; erro do SDK é reduzido à mensagem | `logger.ts:79-80`, `server.ts:494-498` |

---

## 6. Base legal por finalidade (art. 7º)

Bases marcadas como **provisórias** precisam do aval do controlador antes do
go-live; a de `art. 7º, IX` ainda não tem LIA (Análise de Legítimo Interesse)
escrita.

| Finalidade | Base legal proposta | Onde isso está escrito no código |
|---|---|---|
| Registrar o pré-pedido e entregar | **art. 7º, V** — execução de contrato / procedimentos preliminares a pedido do titular | comentário `orders.ts:19-33` e `server.ts:292-295` |
| Consultar CEP no ViaCEP para preencher o endereço | **art. 7º, V** (preparação do pedido), com aviso na política | `cep.ts:9-13` |
| Reservar estoque e limitar uso de cupom | **art. 7º, IX** — legítimo interesse (**LIA a escrever**) | `inventory.ts:174-199`, `orders.ts:797-808` |
| Logs de segurança, rate limit e auditoria | **art. 7º, IX** + **art. 15, IX** (segurança) | `logger.ts:71-90`, `rateLimit` usado em `server.ts:214-246` |
| Minimizar o IP antes de gravar | **art. 6º, III** (necessidade/minimização) | `logger.ts:46-69` |
| Guardar `termsAccepted` | **art. 7º, VI** (obrigação legal/contratual) — prova de aceite | `orders.ts:154` |
| Enviar o texto do chat ao Google/Gemini | **art. 7º, I** (consentimento) + **art. 9º, I** (aviso) — **hoje NÃO EXISTEM** | `server.ts:349-359` |
| Guardar casca comercial após `redact` | **art. 7º, II** (cumprimento de obrigação legal) c/c **art. 16** | `orders.ts:756-766` |

---

## 7. Art. 18 — como atender cada inciso **hoje**

> Autenticação comum de todas as rotas abaixo: **chave administrativa**
> (`x-admin-key`, comparação em tempo constante, 10 tentativas/min por IP) +
> **allowlist de origem**, e as rotas só existem no servidor de dados
> (`adminRoutes.ts:11-31`, `data-server.ts:138-139`). O titular **não** chama a
> API — quem atende é o operador.

| Inciso | Como atender hoje | Evidência | O que falta |
|---|---|---|---|
| **I — confirmação da existência** | `GET /api/admin/titular?telefone=...` (ou `?nome=...`) → o campo `count` responde "sim, tratamos". Busca O(1) por telefone e por nome sem acento/caixa | rota `adminRoutes.ts:89-102`; `findByPhone` `orders.ts:680`; `searchByName` `orders.ts:699`; `searchByTitular` `orders.ts:714-724`; testes `ordersLgpd.test.ts:182-249` | canal do titular publicado (**B6**) e prazo declarado (art. 19, §3º) |
| **II — acesso aos dados** | mesma rota devolve `AdminOrderView` completo: cliente, itens, totais, datas; ou `GET /api/admin/pre-pedidos/:orderNumber` | `adminRoutes.ts:67-74,100`; montagem `orders.ts:294-313` | forma de expedir ao titular (JSON já sai pronto; PDF/planilha é decisão) e **identidade de quem pede** (§7.1) |
| **III — correção de dados** | **NÃO EXISTE.** Não há rota, não há método, não há UI. O único caminho prático hoje é **excluir e refazer** | ausência confirmada: nenhum `PATCH`/`PUT` em `adminRoutes.ts`; decisão em `DECISIONS.md` (seção LGPD) e `BLOCKERS.md` B8 | rota de edição que preserva `orderNumber`/`createdAt` (esboço em `docs/auditorias/lgpd.md` §8.3) — **é lacuna, não promessa** |
| **IV — anonimização/bloqueio/eliminação de excesso** | anonimização: `POST .../redact`; eliminação: `DELETE ...`. **Bloqueio (suspensão do tratamento) NÃO EXISTE** | `adminRoutes.ts:108-132`; `orders.ts:767,739` | modalidade "bloqueio" não foi implementada |
| **V — portabilidade** | `searchByTitular` devolve JSON pronto para exportar (sem limite no domínio; a rota trunca em 100) | `orders.ts:714-724`, `adminRoutes.ts:96-101` | exportação self-service (autenticação de titular) |
| **VI — eliminação** | `DELETE /api/admin/pre-pedidos/:orderNumber` (remove tudo) **ou** `POST .../redact` (apaga PII, mantém nº/data/itens/totais) | `adminRoutes.ts:108-132`; `orders.ts:739-754,767-788` | política de qual usar em cada caso (§8.1 da auditoria LGPD) |
| **VII — informação de compartilhamento** | só o que a política pública disser — e ela ainda não identifica controlador nem encarregado | `SiteFooter.tsx:145` | **B2** (§9) |
| **VIII — informação sobre não consentir** | **NÃO EXISTE publicado** — não há aviso de consentimento no site | `server.ts:357-359` | **B2 + B3** |
| **IX — revogação do consentimento** | único consentimento em vigor é o checkbox de termos (`CheckoutPaymentMethod.tsx:182-232`); revogá-lo, na prática, = eliminar o pedido | `adminRoutes.ts:123` | consentimento do assistente e mecanismo de revogação na UI (**B3**) |

### 7.1 Duas lacunas honestas que atrapalham qualquer inciso

1. **Não existe canal do titular.** O único canal publicado é o Instagram
   (`src/data/siteConfig.ts:9-11`, `BLOCKERS.md` B6). Sem canal + prazo, nenhum
   dos incisos acima é acionável pela cliente — as rotas existem, mas o caminho de
   entrada não.
2. **Não existe prova de identidade do titular.** A confirmação é feita por
   telefone ou nome (`adminRoutes.ts:90-95`): qualquer pessoa que saiba o telefone
   da cliente poderia teoricamente pedir informações sobre ela. Operador **não
   pode** devolver conteúdo por esse canal sem validar identidade por outro meio
   (§8, passo 3).

### 7.2 Nota de precisão sobre o número do inciso

A correção é o **art. 18, III** (LGPD). O **art. 18, IV** é anonimização, bloqueio
ou eliminação de dados excessivos ou desconformes — que é justamente o caminho que
o `redact()` atende, e por isso o IV não pode ser usado para falar de correção sob
risco de o texto final da política atribuir ao titular um direito com outro nome.

Esta divergência foi encontrada durante a montagem do mapa de dados e **já está
corrigida** em `BLOCKERS.md` (B8), `DECISIONS.md`, `docs/GO-LIVE.md` e
`docs/auditorias/lgpd.md` §2.2/§8.3/§9. A decisão em si não foi reaberta —
correção não existe, e este documento não finge que existe.

---

## 8. Roteiro de atendimento — o titular pede exclusão

**Quem executa:** operador com `LOLA_ADMIN_API_KEY` e origem na
`LOLA_ADMIN_ALLOWED_IPS`, falando com o `data-server.ts` (nunca pela vitrine —
`server.ts:56,148-151`).

1. **Receber e registrar o pedido.** Anotar data, canal e o que o titular pediu.
   O canal hoje é o Instagram (`siteConfig.ts:9-11`) — enquanto **B6** não fecha,
   é o que existe.
2. **Identificar os registros.** `GET /api/admin/titular?telefone=(21) 98765-4321`
   (ou `?nome=Maria Silva`). O campo `count` responde o art. 18, I; os `orders`
   vêm com `orderNumber`, `createdAt` e o `redacted` de cada um
   (`adminRoutes.ts:89-102`, `orders.ts:294-313`).
   *Telefone aceito em qualquer forma:* `21 98765-4321`, `(21) 98765-4321`,
   `+55 21 98765-4321` — todas viram a mesma chave (`orders.ts:392-398`).
   *Nome:* sem acento e caixa-insensível, então "João" acha "joao"
   (`orders.ts:406-409`).
3. **Validar que quem pediu é o titular.** Não existe autenticação de titular no
   sistema. Antes de devolver ou excluir, confirmar por um dado que só o titular
   tenha (ex.: número do pré-pedido informado por ele, mais um detalhe do pedido).
   Quem não passar nessa checada recebe **confirmação genérica de que existe
   atendimento**, nunca conteúdo.
4. **Escolher a modalidade** (decisão de política, `docs/auditorias/lgpd.md` §8.1):
   * pré-pedido que nunca virou venda → **`DELETE`** — some por completo;
   * registro que precisa sobreviver para conferência de cupom/estoque →
     **`redact`** — apaga nome/telefone/endereço, mantém número, data, itens e
     totais, e grava `redactedAt` (`orders.ts:756-788`).
   Nos dois casos a resposta ao titular é a mesma: **nenhum dado pessoal permanece
   acessível** (`orders.ts:759-763`).
5. **Executar:**
   ```
   DELETE /api/admin/pre-pedidos/LOLA-20261014-XXXXXXXXXXXX
   POST   /api/admin/pre-pedidos/LOLA-20261014-XXXXXXXXXXXX/redact
   ```
   (`adminRoutes.ts:108-132`). O arquivo é reescrito **com a chave vigente** e com
   rollback em falha de escrita (`orders.ts:739-754,767-788`) — nada some só na
   memória.
6. **Confirmar ao titular**, pela mesma comunicação do passo 1, e registrar a
   conclusão com data e o número do pré-pedido.

### 8.1 O log que fica (art. 37)

| Evento | O que registra | `arquivo:linha` |
|---|---|---|
| `admin.access` | IP (mascarado), método, caminho, `outcome`, motivo — **em toda** chamada administrativa, inclusive as negadas | `logger.ts:173-181` |
| `pedido.eliminado` | número do pré-pedido, `via=admin` | `adminRoutes.ts:130` |
| `pedido.anonimizado` | idem para `redact` | `adminRoutes.ts:115` |
| `pedidos.expirados_removidos` | quantidade, restantes, retenção em dias | `dataPlane.ts:183-188` |
| `http.request` | IP mascarado, método, path, status, ms | `logger.ts:152-158` |

**O que esses logs NÃO registram** (seja honesto se o titular perguntar):

* **quem** operou — não existe conceito de usuário; sobra o IP mascarado do
  `admin.access`;
* **de quem** era o pedido que foi apagado — o `pedido.eliminado` guarda só o
  número (`adminRoutes.ts:130`); depois do `remove`, não há como reconstruir o
  titular a partir do log;
* **qual foi a resposta** dada ao titular;
* **que prazo de retenção de log** vale — não está declarado no projeto (§3).

Isso atende **parcialmente** o art. 37. O registro completo das operações
(**ROPA**) **NÃO EXISTE**: a proposta de formato está em
`docs/auditorias/lgpd.md` §6 — é um documento, não código, e ainda não foi
escrito.

---

## 9. Lacunas que este mapa não resolve (não tentar contornar)

| # | Bloqueio | O que falta | Por que afeta este documento |
|---|---|---|---|
| **B2** | **Política de privacidade sem controlador** (art. 9º, I e art. 41) | razão social · CNPJ · endereço · e-mail do encarregado | Sem identificação do **controlador** e do **encarregado**, a política não pode ser publicada, os incisos VII–IX do art. 18 não têm endereço para onde apontar, e nenhum canal do titular se fecha. O texto já está redigido em `docs/auditorias/lgpd.md` §8.4 com os campos `[Razão social]`, `[CNPJ]`, `[endereço]`, `[nome + e-mail]` **a preencher pelo dono**. Este documento **não substitui** a política e **não preenche** esses campos — não há dado a inventar. |
| **B3** | **Gemini sem consentimento** | manter com aviso (§8.2 da auditoria) **ou** desligar (`GEMINI_API_KEY` vazia) | Enquanto não decidir, o fluxo da §1.2 tem base legal inexistente (`server.ts:357-359`). |
| **B6** | **Sem canal de atendimento** | número oficial de telefone/WhatsApp | Sem canal, os roteiros da §8 são internos: o titular não tem por onde pedir (art. 18 + art. 19, §3º). |
| **B8** | **Correção de dados não existe** | decisão de implementar antes ou depois do go-live | §7, inciso III — é lacuna declarada, sem workaround. |
| — | **ROPA (art. 37)** | uma linha por tratamento | proposta pronta em `docs/auditorias/lgpd.md` §6; não escrita. |
| — | **LIA (art. 10)** para reservas, cupom e logs | documento de legítimo interesse | base provisória da §6. |
| — | **Retenção de log** | prazo + rotação | hoje indefinida no projeto (§3). |
| — | **Google Fonts auto-hospedado** | trocar origem | o IP do visitante sai hoje (`index.html:12-14`). |

---

*Documento interno de apoio ao atendimento. Não é política pública, não substitui
a Política de Privacidade (ver B2) e não cria capacidade que o sistema não tem.*
