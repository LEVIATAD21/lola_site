# API LOLA — contrato completo

Contrato extraído **do código-fonte**, não de intenção de projeto. Cada status,
mensagem e limite abaixo existe em `server.ts`, `data-server.ts` ou `src/server/*`
e foi conferido executando o servidor de desenvolvimento em 14/10/2026.

Fontes: `server.ts`, `data-server.ts`, `src/server/httpDataPlane.ts`,
`src/server/internalRoutes.ts`, `src/server/internalAuth.ts`,
`src/server/internalClient.ts`, `src/server/adminRoutes.ts`,
`src/server/adminAuth.ts`, `src/server/dataPlane.ts`, `src/server/orders.ts`,
`src/server/inventory.ts`, `src/server/rateLimit.ts`,
`src/server/requestGuard.ts`, `src/server/httpError.ts`,
`src/server/ipAllow.ts`, `src/server/securityHeaders.ts`, `api-test.http`.

---

## 1. Quem serve o quê

| Processo | Entrypoint | Porta padrão | Papel |
|---|---|---|---|
| **Vitrine** | `server.ts` | `PORT` (padrão 3000, faixa 1–65535) | Site público + API pública. Não tem estoque, nem pedidos, nem chave de cifra em modo dividido. |
| **Servidor de dados** | `data-server.ts` | `PORT` (padrão 4100, faixa 1–65535), bind `127.0.0.1` por padrão (`LOLA_BIND_HOST`) | Dono dos arquivos: `.data/inventory.json`, `.data/orders.enc.json`, chave AES. Expõe canal interno + painel administrativo. Não serve HTML, SPA, estático nem Vite. |

Dois modos de operação, decididos no boot (nunca por requisição):

- **Embutido** (`LOLA_DATA_SERVICE_URL` ausente): um processo faz as duas
  partes. É o modo dos testes e de quem ainda não separou os servidores.
- **Dividido** (`LOLA_DATA_SERVICE_URL` definida): a vitrine só conversa com o
  servidor de dados pelo canal assinado da seção 3. Nesse modo a vitrine **não
  monta rota administrativa nenhuma** e **não expõe `/internal`**.

### Convenções válidas para todas as rotas

- Todo corpo de erro é JSON no formato `{ "error": "<mensagem>" }`.
- Todo caminho sob `/api/` sai com `Cache-Control: no-store` (requisição e resposta).
- Corpo de requisição limitado a **16 kB**. Acima disso → `413`
  `"Corpo da requisição muito grande."`; JSON malformado → `400`
  `"JSON inválido na requisição."` (`src/server/httpError.ts`).
- Erro não tratado em qualquer ponto da cadeia → `500`
  `"Erro interno do servidor."`, sempre JSON, nunca stack trace (VUL-B).
- Sem `X-Powered-By` (`app.disable('x-powered-by')`).
- Cabeçalhos de segurança em toda resposta (`securityHeaders.ts`):
  `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`,
  `Cross-Origin-Opener-Policy: same-origin`,
  `Cross-Origin-Resource-Policy: same-origin`. **CSP e HSTS só em produção**
  (na vitrine HSTS vem ligado por padrão, desliga com
  `LOLA_HSTS_ENABLED=false`; no servidor de dados HSTS é opt-in —
  `LOLA_HSTS_ENABLED=true`).
- Rate limit responde `429` com `Retry-After` (segundos) e
  `Cache-Control: no-store`.
- `X-Forwarded-For` é ignorado salvo `LOLA_TRUSTED_PROXY` declarado — sem
  isso, limite de taxa e allowlist usam o IP do socket.

---

## 2. API pública (vitrine — `server.ts`)

Qualquer pessoa pode chamar. Proteções em cascata, nesta ordem:

1. Cabeçalhos de segurança (seção 1).
2. **Guarda de origem cross-site** (`requestGuard.ts`) — só para verbos que
   mutam (`POST`/`PUT`/`DELETE`); `GET`/`HEAD`/`OPTIONS` passam.
   - `Origin` ausente → **passa** (curl, Postman, monitor não enviam).
   - `Origin` presente com host diferente do `Host` da requisição, ou
     malformado → **`403 {"error":"Origem não autorizada."}`**.
   - Roda **antes** de qualquer limite de taxa: requisição recusada aqui não
     consome balde de ninguém.
3. **Orçamento bruto** `600/min` por IP+caminho (`LOLA_API_BUDGET_PER_MINUTE`,
   faixa 30–100000) — cobre *tudo* sob `/api`, inclusive `/api/health`, e roda
   antes do body parser (mensagens malformadas também gastam orçamento).
4. `express.json({ limit: '16kb' })`.
5. Limite específico de cada rota (consolidado na seção 5).

### 2.1 `GET /api/health`

| | |
|---|---|
| Serve | vitrine (e `data-server.ts` tem uma própria) |
| Quem | público, **fora** do limite de leitura (dentro do orçamento de 600/min) |
| Corpo | nenhum |

Respostas: `200 {"status":"ok","service":"lola-api","timestamp":"<ISO>"}`.

No `data-server.ts` a rota é `GET /api/health` → `200 {"status":"ok"}`, sem
autenticação, fora do canal interno.

### 2.2 `GET /api/estoque/:productId`

| | |
|---|---|
| Serve | vitrine (lê do servidor de dados no modo dividido) |
| Quem | público |
| Limite | `300/min` por IP (`LOLA_READ_PER_MINUTE`, faixa 10–100000) |
| Query | nenhuma |

Respostas:

| Status | Corpo |
|---|---|
| `200` | `{"productId":"<id>","disponivel":<inteiro≥0>}` |
| `404` | `{"error":"Produto não encontrado no catálogo."}` — id fora do catálogo |
| `429` | limite de leitura |
| `503` | `{"error":"O catálogo está temporariamente indisponível. Recarregue a página em instantes."}` — plano de dados inacessível |

O `disponivel` devolvido é o saldo **líquido de pré-reservas ativas**.
Contadores administrativos (`total`, `reservado`, `vendido`) **nunca** saem
desta rota.

### 2.3 `GET /api/produtos`

| | |
|---|---|
| Serve | vitrine |
| Quem | público |
| Limite | `300/min` por IP |
| Query | `categoria` (igualdade, sem distinção de caixa) · `query` (substring em `name`, `category`, `desc`) |

Respostas: `200` com array de objetos
`{id, name, category, price, material, color, disponivel, desc, image}` ·
`429` · `503` com `PLANO_DE_DADOS_INDISPONIVEL` (mensagem da seção 2.2).
Sem paginação nem ordenação.

> Observação de produto: nenhum componente da vitrine chama esta rota hoje
> (`BLOCKERS.md`, B7) — o front lê `src/data/mockData.ts`. O servidor cobra
> certo, mas a tela pode exibir valor velho.

### 2.4 `GET /api/produto/:productId`

| | |
|---|---|
| Serve | vitrine |
| Quem | público |
| Limite | `300/min` por IP |

Respostas:

| Status | Corpo |
|---|---|
| `200` | objeto do produto com `disponivel` atualizado |
| `404` | `{"error":"Produto não encontrado"}` ← **sem ponto final**, diferente do 404 da rota 2.2 |
| `429` | limite de leitura |
| `503` | `PLANO_DE_DADOS_INDISPONIVEL` |

A ordem importa: o 404 sai **antes** da consulta de estoque.

### 2.5 `POST /api/pedidos/rascunho`

Cria um pré-pedido (não é venda: não há gateway — `paymentStatus` é sempre
`not_configured`). No modo dividido a vitrine só repassa; **validação, reserva
e persistência acontecem no servidor de dados**.

| | |
|---|---|
| Serve | vitrine → (modo dividido) `POST /internal/pedidos` do servidor de dados |
| Quem | público, com `Origin` igual ao `Host` ou sem `Origin` |
| Limite | `10/min` por IP (`LOLA_ORDER_PER_MINUTE`, faixa 1–10000) — mensagem `"Limite temporário de pré-pedidos atingido. Tente novamente em um minuto."` |
| Corpo | JSON objeto, máx. 16 kB |

#### Corpo esperado

```json
{
  "customer": {
    "fullName": "string",  "phone": "string",      "cep": "string",
    "street": "string",    "number": "string",     "complement": "string?",
    "neighborhood": "string", "city": "string",    "state": "UF"
  },
  "items": [{ "productId": "string", "quantity": 1, "variant": "string?" }],
  "paymentMethod": "pix | boleto",
  "shippingOptionId": "pac | sedex | transportadora",
  "couponCode": "string?",
  "giftWrap": true | false,
  "termsAccepted": true
}
```

#### Validações e respostas (`src/server/orders.ts` + `inventory.ts`)

Toda recusa é `4xx/5xx` com `{ "error": "<mensagem>" }`.

| Status | Condição | Mensagem exata |
|---|---|---|
| `400` | corpo não é objeto JSON (array, string, ausente) | `Dados do pré-pedido inválidos.` |
| `400` | `customer` ausente ou não-objeto | `Preencha os dados de entrega.` |
| `400` | qualquer valor de `customer` contém `<` ou `>` | `Os campos de endereço não podem conter caracteres de marcação (< ou >).` |
| `400` | campo obrigatório fora do tamanho | `Confira nome, logradouro, número e endereço antes de continuar.` |
| `400` | telefone com menos de 10 ou mais de 11 dígitos | `Informe um telefone válido com DDD.` |
| `400` | CEP inválido | `Informe um CEP brasileiro válido com 8 dígitos.` |
| `400` | `state` fora das 27 UF | `Selecione um estado brasileiro válido.` |
| `400` | `termsAccepted !== true` | `É necessário aceitar os termos para registrar a solicitação.` |
| `400` | `paymentMethod === "credit_card"` | `Pagamento por cartão indisponível: a integração segura com o provedor ainda não foi configurada.` |
| `400` | `paymentMethod` fora de `pix`/`boleto` | `Selecione uma forma de pré-pedido válida.` |
| `400` | `giftWrap` não é booleano | `Opção de embalagem de presente inválida.` |
| `400` | `shippingOptionId` fora da lista (ausente assume `pac`) | `Modalidade de frete inválida.` |
| `400` | `couponCode` não-string ou acima de 40 caracteres | `Cupom inválido.` |
| `400` | cupom desconhecido | `O cupom informado não é válido.` |
| `400` | cupom expirado | `Este cupom expirou.` |
| `400` | subtotal abaixo do mínimo do cupom | `Este cupom vale a partir de R$ 150,00 em produtos.` (valor real do mínimo) |
| `400` | teto de usos do cupom atingido | `Este cupom já atingiu o limite de usos.` |
| `400` | `items` não é array de 1 a 30 linhas | `A solicitação deve conter de 1 a 30 linhas de produto.` |
| `400` | linha sem `productId` string não-vazia | `Um dos itens da solicitação é inválido.` |
| `400` | `quantity` não é inteiro seguro entre 1 e 99 | `A quantidade de cada item deve ser um inteiro entre 1 e 99.` |
| `400` | `variant` presente e inválida (>100 chars ou com marcação) | `Uma das variações do produto é inválida.` |
| `404` | `productId` fora do catálogo | `Um dos produtos não existe no catálogo atual.` |
| `409` | produto sem estoque configurado | `O estoque deste produto ainda não foi configurado.` |
| `409` | saldo insuficiente na validação | `Estoque insuficiente para <nome do produto>. Revise a quantidade na sacola.` |
| `409` | saldo estourou entre validação e reserva | `O estoque acabou durante o registro. Atualize a sacola e tente novamente.` |
| `429` | teto de pré-reservas por origem (`LOLA_MAX_HOLDS_PER_ORIGIN`, padrão 10 embutido / **0 = desligado** dividido) | `Este cliente já tem muitas pré-reservas ativas. Aguarde alguns minutos ou finalize o pedido em aberto.` |
| `429` | teto global de pré-reservas (`LOLA_MAX_ACTIVE_HOLDS`, padrão 500) | `O sistema está com muitas pré-reservas ativas no momento. Tente novamente em instantes.` |
| `429` | limite de 10/min da rota | `Limite temporário de pré-pedidos atingido. Tente novamente em um minuto.` |
| `500` | falha ao gravar o arquivo cifrado (reserva é desfeita) | `Não foi possível salvar a solicitação com segurança. Tente novamente.` |
| `503` | armazenamento de pedidos indisponível | `O registro de pré-pedidos está temporariamente indisponível. Tente novamente mais tarde ou fale com o atendimento.` |
| `503` | 10.000 registros (teto do arquivo único) | `Capacidade de pré-pedidos esgotada. A loja precisa liberar espaço antes de novas solicitações.` |
| `503` | modo dividido: falha, timeout ou resposta sem assinatura válida do servidor de dados | `O registro de pré-pedidos está temporariamente indisponível. Tente novamente mais tarde ou fale com o atendimento.` |

Ordem das verificações: estrutura → texto/endereço → telefone → CEP → UF →
termos → pagamento → embalagem → frete → cupom (só existência) → itens →
catálogo → estoque → reserva → persistência. **`503` de armazenamento vem
ANTES de qualquer validação**: com a chave de pedidos quebrada, nem um `400`
válido é possível (ver `api-test.http`).

#### Sucesso

`201`:

```json
{
  "success": true,
  "order": {
    "orderNumber": "LOLA-AAAAMMDD-XXXXXXXXXXXX",
    "createdAt": "2026-10-14T07:30:58.915Z",
    "status": "awaiting_payment_setup",
    "paymentStatus": "not_configured",
    "paymentMethod": "pix",
    "shippingOptionId": "pac",
    "itemCount": 1,
    "subtotal": 49.9, "discount": 0, "shipping": 19.9,
    "giftWrap": 0, "total": 69.8
  }
}
```

O que o servidor calcula sozinho e **ignora se vier do cliente**:

- `price`, `unitPriceCents`, `lineTotalCents` de cada item — o preço nasce do
  catálogo (`Math.round(product.price * 100)`), nunca do corpo.
- `subtotal`, `discount`, `shipping`, `giftWrap`, `total`, `couponPercentage`.
- Frete: `pac` 1990 (grátis ≥ R$ 150), `sedex` 1290 grátis / 2890 acima,
  `transportadora` 2250 (grátis ≥ R$ 150); embalagem de presente 990.
- Desconto: percentual da tabela de cupons aplicado ao subtotal real.
- `orderNumber`, `createdAt`, `id`, `status` (`awaiting_payment_setup`),
  `paymentStatus` (`not_configured`), `termsAccepted` (sempre `true` no
  registro gravado).
- Normalização do cliente: telefone e CEP viram só dígitos, `state` vira
  caixa alta, textos colapsam espaços e perdem controles, `variant` só passa
  limpa.
- Campos a mais no corpo são descartados; não há como gravar IP, cartão ou
  `giftWrap` booleano no registro.
- O corpo devolvido é **projetado campo a campo** no modo dividido
  (`projectPublicOrder`): só os 13 campos públicos acima atravessam, mesmo que
  o servidor de dados mande algo a mais.

### 2.6 `POST /api/ai/consulta`

Assistente Virtual Lola.

| | |
|---|---|
| Serve | vitrine |
| Quem | público (com a mesma guarda de origem) |
| Limites | `20/min` (`LOLA_AI_PER_MINUTE`) · `120/h` (`LOLA_AI_PER_HOUR`) · `400/dia` (`LOLA_AI_PER_DAY`) |
| Timeout do provedor | `LOLA_AI_TIMEOUT_MS` (padrão 20.000 ms, faixa 5.000–120.000) — estourou, cai no motor local |

Corpo: `{"pergunta": "<string>", "contexto": {"produtoId": "...", "carrinho": [...]}}`.

| Status | Condição | Mensagem |
|---|---|---|
| `400` | `pergunta` ausente ou vazio | `Campo "pergunta" é obrigatório.` |
| `413` | `pergunta` acima de 1200 caracteres | `A pergunta deve ter no máximo 1200 caracteres.` |
| `429` | qualquer um dos três limites | mensagem do limite correspondente |
| `503` | plano de dados inacessível | `O catálogo está temporariamente indisponível. Recarregue a página em instantes.` |
| `200` | sempre nos demais casos (chave ausente/falha → motor local) | `{"resposta": "<string>", "referencias": [{"tipo":"produto\|FAQ\|politica","id","titulo","link"}]}` |

O que é ignorado do cliente: nomes, preços e descrições vindos em
`contexto` — o servidor reconstrói o contexto **só** a partir do catálogo
oficial. `contexto.produtoId` acima de 120 caracteres é tratado como vazio;
`contexto.carrinho` aceita no máximo 30 itens, descarta ids desconhecidos e
quantidades fora de 1–99. Campos extras (ex.: `sessaoCliente`) são ignorados.

> Saída de dado pessoal para terceiro (LGPD, art. 39): com `GEMINI_API_KEY`
> definida, o texto digitado mais produto/sacola viajam para a API do Gemini.
> Sem a chave, nada sai da máquina. Ver `BLOCKERS.md`, B3.

### 2.7 Rotas inexistentes

- Qualquer caminho sob `/api/` sem handler → **`404 {"error":"Endpoint de API não encontrado."}`**
- Qualquer caminho sob `/internal/` na vitrine → **`404 {"error":"Endpoint de API não encontrado."}`**
  (declarado de propósito: o canal interno nunca pode cair no fallback da SPA)
- `POST /api/estoque/atualizar` na vitrine → **`404`** quando o painel
  administrativo não está montado (modo dividido, ou produção sem
  `LOLA_EMBEDDED_ADMIN=true`). Em desenvolvimento embutido a rota **existe**
  aqui e responde `401` sem a chave — ver seção 4.2.
- Qualquer caminho fora de `/api/` e `/internal/` → **fallback da SPA**
  (`index.html` em produção, middleware do Vite em dev) — inclusive quando não
  existe arquivo nenhum. Ver armadilhas.

---

## 3. API interna assinada (`data-server.ts`)

Canal máquina-a-máquina exclusivo da vitrine → servidor de dados. Não é
"público com segredo": **exige assinatura HMAC por requisição**, e o servidor de
dados nem sobe sem `LOLA_INTERNAL_SECRET` de pelo menos 32 caracteres
(`INTERNAL_SECRET_MIN_LENGTH`).

Ninguém além da vitrine tem o segredo. Quem alcançar a porta não faz nada sem
ele — e toda recusa responde igual.

### 3.1 Autenticação de requisição

Cabeçalhos obrigatórios (`internalAuth.ts`):

| Cabeçalho | Formato |
|---|---|
| `x-lola-ts` | exatamente 13 dígitos (milissegundos desde a época) |
| `x-lola-nonce` | 16–64 caracteres de `[A-Za-z0-9_-]`, gerado por requisição, **uso único** |
| `x-lola-sig` | 64 hex — HMAC-SHA256 sobre a cadeia canônica |
| `content-type` | `application/json` |

Cadeia canônica (separador `\n`):

```
lola-internal-v1
<ts>
<nonce>
<MÉTODO EM CAIXA ALTA>
<caminho absoluto, sem query string>
<sha256hex(bytes crus do corpo)>
```

Regras de verificação, todas falha-fechada:

- Janela de relógio `±LOLA_INTERNAL_SKEW_MS` (padrão 30.000 ms, faixa
  5.000–300.000).
- Nonce já visto → replay; TTL do cache de nonces = 3× janela.
- Comprimento e conteúdo comparados em **tempo constante**.
- **Query string ou `#` no caminho → recusa** (ambiguidade de normalização).
- Corpo assinado sobre os bytes crus (`express.raw`, qualquer
  `Content-Type`, limite 16 kB) — nunca sobre objeto re-serializado.
- Sem segredo (ou segredo < 32 chars) o middleware recusa tudo.

**Toda recusa é idêntica**: `401 {"error":"Não autorizado."}` — mesmo corpo,
mesmo status, para formato de timestamp, assinatura errada, replay, caminho
com query e segredo ausente. O motivo real fica no log do operador.

Recusa de limite de taxa do canal: `429 {"error":"Limite temporário de
chamadas internas atingido."}` — `10.000/min` por IP de socket
(`LOLA_INTERNAL_PER_MINUTE`, faixa 60–1.000.000), balde único por origem, sem
caminho na chave.

### 3.2 Autenticação de resposta (volta)

Toda resposta que sai dos handlers leva `x-lola-resp-sig`:

```
HMAC-SHA256(segredo,
  "lola-internal-resp-v1\n<nonce da requisição>\n<status>\n<sha256hex(corpo)>")
```

O nonce amarra a resposta à requisição; o status impede rebaixamento de
código; o digesto cobre os bytes exatos. Resposta sem assinatura válida →
falha de transporte para o chamador.

**Recusas antes da assinatura não são assinadas**: `429` de taxa e `401` de
autenticação saem sem `x-lola-resp-sig`. Na prática a vitrine nunca as vê:
`HttpDataPlane` as trata como falha e responde `503` genérico ao navegador.

### 3.3 `GET /internal/estoque`

| | |
|---|---|
| Serve | **só** `data-server.ts` |
| Quem | só canal interno assinado |
| Limite | `10.000/min` por IP de socket |
| Respostas | `200 {"stock": {"<productId>": <inteiro>, ...}}` · `503 {"error":"Estoque temporariamente indisponível."}` · `401`/`429` pré-assinatura |

A vitrine consome esta rota e **só aceita ids do catálogo** com inteiro entre
0 e 1.000.000.000, gravando em objeto sem protótipo (`sanitizeStock`); o que
não casar é descartado, e um snapshot sem nenhum item válido vira `503`.

### 3.4 `POST /internal/pedidos`

| | |
|---|---|
| Serve | **só** `data-server.ts` |
| Quem | só canal interno assinado |
| Corpo | mesmo objeto do pré-pedido público (seção 2.5), JSON, máx. 16 kB |
| Respostas | idênticas em status e mensagem às da seção 2.5 (`201`, `400`, `404`, `409`, `429`, `500`, `503`) |

Diferenças em relação à vitrine:

- `400 {"error":"JSON inválido na requisição."}` para corpo não parseável
  (corpo vazio vira `{}` e cai nas validações normais).
- Erro lançado pelo handler → `503 {"error":"O registro de pré-pedidos está
  temporariamente indisponível."}` (mensagem daqui, mais curta que a da
  vitrine).
- `meta.ip` é **sempre** o IP da vitrine (a rede privada não vê a cliente), e é
  por isso que `LOLA_MAX_HOLDS_PER_ORIGIN` vem **desligado (0)** neste processo:
  o teto por origem passaria a valer por loja, não por cliente.

### 3.5 Limites do transportador (`internalClient.ts`)

- Base URL vem **só** de `LOLA_DATA_SERVICE_URL` (ambiente) — nunca de header,
  query ou corpo do visitante.
- Recusa URL com usuário/senha, query string ou fragmento.
- Recusa `http://` fora de loopback, salvo `LOLA_INTERNAL_PLAINTEXT=true`.
- Recusa faixa link-local (`169.254.0.0/16`, `fe80::/10`) sempre.
- `redirect: 'error'` — nunca segue redirect.
- Timeout `LOLA_INTERNAL_TIMEOUT_MS` (padrão 3.000 ms, faixa 100–30.000).
- Corpo de saída máx. 16.000 bytes; resposta máx. 64.000 bytes — acima,
  falha silenciosa (vira `503` na vitrine).
- Cabeçalho `Cache-Control: no-store` em toda resposta interna.

---

## 4. API administrativa (chave + allowlist)

Montada por `createAdminRouter` sob o prefixo `/api`, **sempre** no
`data-server.ts` e na vitrine **apenas** quando todas as condições valem:

- modo embutido (`LOLA_DATA_SERVICE_URL` ausente);
- em produção, `LOLA_EMBEDDED_ADMIN=true` (em desenvolvimento, sempre);
- sem proxy declarado **ou** `LOLA_ADMIN_ALLOW_PRIVATE_PROXY=true`.

Fora disso, `/api/admin/*` e `/api/estoque/atualizar` na vitrine respondem
`404 {"error":"Endpoint de API não encontrado."}` — a superfície administrativa
simplesmente não existe lá, mesmo com a chave certa.

### 4.1 Duas travas por rota, nesta ordem

1. **Chave administrativa** no cabeçalho `x-admin-key`, comparada em tempo
   constante, mínimo de 32 caracteres em `LOLA_ADMIN_API_KEY`.
   - Resposta `401 {"error":"Chave administrativa inválida ou operação não habilitada neste servidor."}` para
     **chave errada, chave ausente e chave não configurada** — idêntica nos três
     casos, por design (VUL-11). A configuração real só aparece no log.
   - `LOLA_ADMIN_API_KEY` curta/ausente → **todas** as rotas respondem esse
     mesmo `401`.
2. **Allowlist de origem** (`LOLA_ADMIN_ALLOWED_IPS`), lida de
   `req.socket.remoteAddress`:
   - `403 {"error":"Origem não autorizada para esta operação."}`
   - ausente/vazio → faixa privada por padrão (`127.0.0.0/8`, `10/8`,
     `172.16/12`, `192.168/16`, `169.254/16`, `::1`, `fc00::/7`, `fe80::/10`);
   - `any` → sem restrição (com aviso no log);
   - entrada inválida na lista → **cai inteira** para a faixa privada.

Além disso, **10 tentativas por minuto por IP de socket**, contagem
compartilhada por todas as rotas administrativas:
`429 {"error":"Muitas tentativas administrativas. Aguarde um minuto e tente novamente."}`.
O contador inclui os acertos — a allowlist é quem protege o painel de tráfego
legítimo que não tem a chave.

Não há CORS nem preflight: a chave mora no backend do painel e nunca existe
dentro de um navegador. Cada chamada (permitida ou não) gera log `admin.access`.

### 4.2 `POST /api/estoque/atualizar`

Baixa estrita e persistente de estoque (venda confirmada).

| | |
|---|---|
| Serve | `data-server.ts` sempre; na vitrine **só** em modo embutido com `MOUNT_ADMIN` (fora isso → `404`) |
| Quem | `x-admin-key` + origem na allowlist |
| Corpo | `{"productId": "string", "quantidade": <inteiro > 0>}` (JSON, 16 kB) |

| Status | Mensagem |
|---|---|
| `200` | `{"success":true,"productId":"...","novoDisponivel":<n>,"vendido":<n>}` |
| `400` | `productId é obrigatório.` |
| `400` | `quantidade deve ser um inteiro positivo.` |
| `401` / `403` / `429` | travas da seção 4.1 |
| `404` | `Produto não encontrado no catálogo.` |
| `409` | `Estoque insuficiente para esta quantidade.` |
| `500` | `Não foi possível salvar a atualização de estoque.` (estoque e reservas restaurados) |

A baixa consome **primeiro** as unidades pré-reservadas (alocação FIFO) e só
depois as livres; `novoDisponivel` devolvido já é líquido.

### 4.3 `GET /api/admin/pre-pedidos`

| | |
|---|---|
| Serve | `data-server.ts` (vitrine só em modo embutido com `MOUNT_ADMIN`) |
| Quem | `x-admin-key` + allowlist |
| Query | `limit` — inteiro 1–100, padrão 50; valor não-inteiro → 50 |

Respostas: `200 {"orders": [<AdminOrderView>]}` · `401`/`403`/`429`.
Cada item traz `customer` completo (PII) quando não anonimizado, itens, totais
em reais (`subtotalCents/100`), `couponCode` e `redacted`.

### 4.4 `GET /api/admin/pre-pedidos/:orderNumber`

`orderNumber` precisa casar `/^LOLA-\d{8}-[A-F0-9]{12}$/`.

| Status | Mensagem |
|---|---|
| `200` | `{"order": <AdminOrderView>}` |
| `400` | `Código de pré-pedido inválido.` |
| `404` | `Pré-pedido não encontrado.` |
| `401`/`403`/`429` | travas da seção 4.1 |

### 4.5 `GET /api/admin/titular` — fluxo do titular (LGPD art. 18, I e V)

| | |
|---|---|
| Query | `telefone` e/ou `nome` — pelo menos um com valor não-vazio |
| Respostas | `200 {"count":<total encontrado>,"truncated":<bool>,"orders":[...]}` (máx. 100 itens) |
| | `400 {"error":"Informe telefone ou nome do titular para buscar."}` |
| | `401`/`403`/`429` |

Busca por telefone (índice O(1), aceita `21987654321`, `(21) 98765-4321` e
`+55 21...` como a mesma chave) cruzada com nome sem acento e sem caixa. `count`
responde "sim, tratamos"; `truncated` diz se a lista foi cortada em 100.
**O titular não chama esta rota** — quem atende é o operador, e toda chamada é
auditada.

### 4.6 `POST /api/admin/pre-pedidos/:orderNumber/redact`

LGPD art. 18, VI — apaga nome, telefone e endereço; mantém número, data, itens
e totais (`redactedAt` marcado).

`200 {"success":true,"orderNumber":"...","acao":"anonimizado"}` ·
`400` `Código de pré-pedido inválido.` · `404` `Pré-pedido não encontrado.` ·
`401`/`403`/`429`.

### 4.7 `DELETE /api/admin/pre-pedidos/:orderNumber`

LGPD art. 18, VI — elimina o registro e reescreve o arquivo cifrado com a chave
vigente.

`200 {"success":true,"orderNumber":"...","acao":"eliminado"}` · `400` · `404` ·
`401`/`403`/`429`.

### 4.8 O que **não** existe na administrativa

Nenhuma rota de criação/edição de produto, de preço, de cupom, de usuário ou de
configuração. O catálogo nasce de `src/data/mockData.ts`, compilado nos dois
processos; os cupons nascem de `src/data/coupons.ts`. Mudar preço exige
deploy.

---

## 5. Limites de taxa — tabela consolidada

| Limite | Janela | Máximo | Variável (faixa) | Mensagem do `429` | Onde |
|---|---|---|---|---|---|
| Orçamento bruto `/api` | 60 s | 600 | `LOLA_API_BUDGET_PER_MINUTE` (30–100000) | `Muitas requisições. Aguarde um minuto e tente novamente.` | vitrine, antes do body parser |
| Leitura de catálogo/estoque | 60 s | 300 | `LOLA_READ_PER_MINUTE` (10–100000) | `Limite temporário de consultas atingido. Aguarde um instante e tente novamente.` | vitrine |
| Pré-pedido | 60 s | 10 | `LOLA_ORDER_PER_MINUTE` (1–10000) | `Limite temporário de pré-pedidos atingido. Tente novamente em um minuto.` | vitrine |
| IA — minuto | 60 s | 20 | `LOLA_AI_PER_MINUTE` (1–10000) | `Limite temporário de consultas atingido. Tente novamente em um minuto.` | vitrine |
| IA — hora | 60 min | 120 | `LOLA_AI_PER_HOUR` (1–100000) | `Limite horário de consultas atingido. Tente novamente mais tarde.` | vitrine |
| IA — dia | 24 h | 400 | `LOLA_AI_PER_DAY` (1–1000000) | `Limite diário de consultas atingido. Fale com o atendimento se precisar de ajuda.` | vitrine |
| Canal interno | 60 s | 10.000 | `LOLA_INTERNAL_PER_MINUTE` (60–1000000) | `Limite temporário de chamadas internas atingido.` | servidor de dados |
| Tentativas administrativas | 60 s | 10 | fixo | `Muitas tentativas administrativas. Aguarde um minuto e tente novamente.` | servidor de dados |
| Pré-reservas simultâneas | — | 500 (global) / 10 por origem | `LOLA_MAX_ACTIVE_HOLDS` (10–100000) · `LOLA_MAX_HOLDS_PER_ORIGIN` (0–10000) | ver seção 2.5 | plano de dados |

Comportamento comum (`rateLimit.ts`):

- Chave padrão = **IP + padrão da rota** (`req.route.path`), não o caminho
  concreto: todos os `/api/estoque/<qualquer>` disputam os mesmos 300/min, e
  grafias diferentes da mesma URL (`/API/pedidos/rascunho`, `%2e`, `..`)
  caem no mesmo balde.
- Sem espaço para novo balde (tabela cheia) → **falha fechada**: `429` novo em
  vez de criar balde às custas dos demais.
- Janela deslizante por balde, sem bloqueio por exatidão de relógio.
- Instância única em memória: para múltiplas instâncias, o teto real precisa
  vir de WAF/proxy compartilhado.

---

## 6. Armadilhas conhecidas

1. **`GET /.env` devolve `200` — e isso não é vazamento.** É o fallback da
   SPA: qualquer caminho fora de `/api` e `/internal` sem arquivo correspondente
   responde `200` com `index.html`. O teste certo nunca é o status: confira o
   `Content-Type` (`text/html`, não `text/plain`) e o corpo (tem que começar
   com `<!doctype html>`). O mesmo vale para `/qualquer-coisa-inexistente`,
   `/orders.key` e `/cert.pem` — que **não existem** e por isso caem no
   fallback.
2. **Arquivo sensível que EXISTE devolve `403` HTML, não `404`.** Em
   `npm run dev`, `GET /data-server.ts`, `/server.ts` e `/.data/orders.key`
   respondem `403` com o HTML "403 Restricted" do Vite. A sonda
   `api-test.http` (item 3) diz "Esperado: 404 em todos" — divergência
   confirmada em 14/10/2026: o status correto é `403`. Um `200` com
   `text/javascript` ou `text/plain` é regressão; `200` com `text/html` de
   índice é fallback de arquivo inexistente.
3. **Nunca teste vazamento só pelo status.** Os dois casos acima (200 que é
   SPA, 403 que é bloqueio real) mostram por quê: o código `200` sozinho tanto
   mascara vazamento quanto assusta à toa.
4. **`paymentStatus: "not_configured"` e `status: "awaiting_payment_setup"`
   são o estado real**, não bug — não há gateway (BLOCKERS B1). Não "melhore"
   isso.
5. **O `503` de pré-pedido vem antes da validação.** Se `.data/orders.key` não
   casar com `.data/orders.enc.json`, todo `POST /api/pedidos/rascunho` responde
   `503` mesmo com corpo perfeito. O motivo real (chave, permissão, cifra) só
   existe no log — a resposta é sempre a mesma frase (VUL-18). Se um dia a
   resposta disser mais que isso, virou oráculo de configuração.
6. **Preço do cliente é ignorado.** `{"items":[{"productId":"brinco-1",
   "quantity":1,"price":0.01}]}` responde `201` com `subtotal: 49.9`. Conferir
   `subtotal`/`total` é o teste; conferir se o `price` foi aceito é ilusão.
7. **Sem `Origin` o `POST` passa; com `Origin` errado ele morre em `403`.**
   `curl` sem Origin → `400`/`201`; `Origin` de outro host → `403 {"error":
   "Origem não autorizada."}`; `Origin` malformado → `403`. A guarda roda
   antes de todo limite de taxa (VUL-E).
8. **`/api/health` não tem limite de leitura, mas tem orçamento.** 600/min por
   IP+caminho — monitor muito agressivo pode estourar.
9. **O `404` da administrativa não é erro.** Em modo dividido (ou sem
   `LOLA_EMBEDDED_ADMIN=true`), `GET /api/admin/pre-pedidos` na vitrine dá
   `404` mesmo com a chave certa. Isso é a separação funcionando; `401` ali
   só aparece no servidor de dados.
10. **Duas mensagens de `404` diferentes, umas com ponto e outra sem:**
    `/api/estoque/:id` → `Produto não encontrado no catálogo.` ·
    `/api/produto/:id` → `Produto não encontrado` · qualquer outra rota `/api`
    → `Endpoint de API não encontrado.`. Fora de `/api` não há `404` nenhum
    (fallback da SPA).
11. **Erros `400`/`413` do body parser não passam pelo `500` genérico.**
    JSON malformado → `400 {"error":"JSON inválido na requisição."}`; corpo
    acima de 16 kB → `413 {"error":"Corpo da requisição muito grande."}`.
    Qualquer outro erro na cadeia → `500 {"error":"Erro interno do servidor."}`
    sem caminho, função nem `node_modules` na resposta.
12. **`Retry-After` só existe em `429`.** Em `400`/`403`/`503` não há para
    onde esperar.
13. **`X-Forwarded-For` não muda o balde** enquanto `LOLA_TRUSTED_PROXY` não
    for declarado. Um header forjado não cria balde novo — mas declarar proxy
    sem entender a allowlist administrativa transforma a origem dela em algo
    que o chamador escolhe (VUL-I).
14. **A allowlist administrativa não sobrevive a um balanceador.** Ela lê
    `req.socket.remoteAddress`; atrás de LB na rede privada todo mundo aparece
    como IP privado e passa no padrão. Sem proxy declarado é a única trava
    mesmo — e a chave responde `401` em 10 tentativas por minuto.
15. **O canal interno recusa query string.** `/internal/estoque?x=1` → `401`
    `Não autorizado.` mesmo com assinatura válida — o caminho assinado precisa
    ser inequívoco.
16. **Recusa do canal não chega ao navegador como `401`.** Sem assinatura de
    resposta válida (`x-lola-resp-sig`) a vitrine trata tudo como falha de
    transporte e responde `503` genérico. Ver `401`/`429` do servidor de dados
    na vitrine é sinal de que a assinatura de resposta foi perdida ou forjada
    (MITM).
17. **Pré-pedido criado em desenvolvimento é pré-pedido real.** O `201` grava
    em `.data/orders.enc.json` cifrado, conta no teto de 10.000 e entra na
    busca administrativa. Não existe ambiente de teste de pedido — qualquer
    payload de exemplo que você enviar durante auditoria é dado gravado (a
    menos que a chave de pedidos esteja quebrada, quando tudo dá `503`).
18. **CSP e HSTS não existem fora de produção na vitrine.** Testar
    `Content-Security-Policy` com `NODE_ENV` diferente de `production` devolve
    vazio. No servidor de dados, HSTS é opt-in mesmo em produção.
19. **Cupom não é endpoint.** Não há `GET /api/cupons`; a tabela mora em
    `src/data/coupons.ts` (bundle do front) e a **autoridade** é o servidor,
    que valida validade, mínimo e teto de usos no momento do pré-pedido.
20. **`/internal` e `/api/admin/*` não existem na vitrine em modo dividido.**
    Achar `404` nessas URLs não significa que a rota sumiu do projeto —
    significa que você bateu no processo errado (ou que `MOUNT_ADMIN` está
    desligado). Em desenvolvimento embutido, `POST /api/estoque/atualizar`
    **existe** na vitrine e responde `401` sem a chave.
