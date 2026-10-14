# Auditoria de segurança — canal interno e API administrativa

**Escopo:** `src/server/internalAuth.ts`, `internalClient.ts`, `httpDataPlane.ts`,
`internalRoutes.ts`, `adminAuth.ts`, `adminRoutes.ts`, `ipAllow.ts`,
`trustedProxy.ts`, `rateLimit.ts`, `requestGuard.ts`, `data-server.ts` (e o uso
disso no `server.ts`).

**Autoridade do teste:** `npx tsc --noEmit` limpo; `npx vitest run` com **272
testes verdes** (258 originais + 14 novos desta auditoria). Branch
`agente/interno`.

**Modelo de ameaça assumido:** atacante capaz de ler, dropar, modificar e
reinjetar tráfego na rede privada entre o `server.ts` (vitrine) e o
`data-server.ts` — exatamente o pressuposto que o próprio código declara em
`internalAuth.ts:8-9` ("confiar no servidor vizinho é justamente o pressuposto
que uma rede comprometida derruba"). O atacante **não** tem `LOLA_INTERNAL_SECRET` nem `LOLA_ADMIN_API_KEY`, nem acesso aos hosts.

---

## Sumário executivo

O canal de requisição (vitrine → servidor de dados) estava sólido: HMAC sobre
método + caminho + corpo, nonce anti-replay gravado **só depois** da assinatura
validar, comparação em tempo constante, redirect recusado, timeout abortável.

A lacuna principal estava no sentido de **volta**: as **respostas do canal
interno não eram autenticadas**. Um MITM na rede privada forjava um `201` de
pré-pedido com corpo de formato público adivinhável e a vitrine entregava à
cliente um código de confirmação (`LOLA-…`) que não existe em lugar nenhum —
perda de integridade de negócio, não apenas exibição errada. **Corrigido.**

Dois achados menores de configuração/observabilidade também foram corrigidos:
aceitação de faixa link-local (metadata service de nuvem) em
`LOLA_DATA_SERVICE_URL`, e a ausência de sinalização no boot do `data-server`
quando a chave administrativa não está configurada.

Nada foi encontrado que permita a um atacante externo forjar o canal, esgotar a
tabela de nonces sem a chave, contornar a allowlist administrativa ou obter
oráculo de chave por timing.

| # | Achado | Severidade | Status |
|---|--------|-----------|--------|
| 1 | Respostas do canal interno sem autenticação (MITM forja `201` e estoque) | **Alto** | Corrigido |
| 2 | `LOLA_DATA_SERVICE_URL` aceita faixa link-local (metadata service) | **Médio** | Corrigido |
| 3 | `data-server.ts` sem aviso de boot para `LOLA_ADMIN_API_KEY` ausente/curta | **Baixo** | Corrigido |
| 4 | Lockout admin de 10 req/min por IP conta também acertos | Informativo | Decisão de operação (seção final) |

---

## Achado 1 — Respostas do canal interno não eram autenticadas (Alto, corrigido)

**Antes:** `internalRoutes.ts` respondia via `res.json(...)` sem nenhum
cabeçalho de integridade, e `internalClient.ts` aceitava qualquer JSON com
formato plausível (`HttpDataPlane` ainda filtrava por ids do catálogo, mas o
formato de um pedido público — `orderNumber`, `status`, números — é de
conhecimento público, inclusive no próprio frontend).

**PoC (antes da correção):** um MITM entre os processos repassa a requisição e
reescreve a resposta:

```
POST /internal/pedidos  (requisição legítima, assinada, passa pelo MITM intacta)
data-server responde: 409 {"error":"Estoque insuficiente."}
MITM reescreve:       201 {"success":true,"order":{"orderNumber":"LOLA-20261013-ABCDEF123456", ...}}
vitrine:              "Pedido confirmado! Anote seu código: LOLA-20261013-ABCDEF123456"
→ nenhum pedido existe no servidor de dados. Idem para GET /internal/estoque
  (estoque forjado: "esgotado" para derrubar a loja, ou inflado).
```

O mesmo vale para o sentido inverso do CSRF de resposta: sem nonce amarrando a
resposta à requisição, uma resposta capturada era reutilizável.

**Impacto:** integridade de negócio (confirmações de pedido falsas), indisponibilidade
sob exibição (estoque forjado), exibição de dados velhos forjados. Não era
exfiltração — para isso o MITM já lê o trânsito em http (mitigado por TLS
opt-in, decisão de deploy).

**Correção (baixo custo, mesmo protocolo, duas pontas neste repositório):**

- `src/server/internalAuth.ts:83-119` — novo header `x-lola-resp-sig` e
  `signInternalResponse`/`verifyInternalResponse`: HMAC-SHA256 sobre
  `lola-internal-resp-v1 | nonce da requisição | status | sha256hex(corpo)`.
  Verificação em tempo constante, comprimento fixo (mesmo padrão do VUL-M).
- `src/server/internalRoutes.ts:67-82` — logo após a autenticação, um wrapper
  em `res.json` assina **toda** resposta do router (sucesso e recusa de
  negócio), sobre os bytes exatos serializados e o `status` vigente.
- `src/server/internalClient.ts:214-227` — o cliente só aceita resposta cuja
  assinatura bate com o **nonce que ele mesmo gerou**, o status recebido e o
  corpo recebido; caso contrário `ok:false, failure:'assinatura_resposta_invalida'`
  → a vitrine responde 503 genérico (falha fechada, mesma mensagem de sempre).

O nonce amarra resposta à requisição (anti-replay de resposta); o status impede
"rebaixar" uma recusa em sucesso ou vice-versa.

**Comportamento residual alterado (proposital e documentado):** recusas do
próprio transporte que ocorrem **antes** do wrapper (429 do rate limit interno,
401 de autenticação) não são assinadas e agora viram 503 genérico na vitrine em
vez de repassar a mensagem. Era o efeito prático delas já hoje (indisponível),
e um MITM consegue produzi-las simplesmente dropando o tráfego — que é
impedível por assinatura.

**Testes novos:** `internalClient.test.ts` (resposta sem assinatura, corpo
adulterado, status adulterado `409→201`, assinatura de outra chave, e duas
PoCs de ponta a ponta com MITM real: reescrita de corpo de estoque e de
`409→201` de pedido); `internalRoutes.test.ts` (respostas de sucesso e de erro
vêm assinadas e verificam); `internalAuth.test.ts` (sensibilidade a
nonce/status/corpo/chave; assinatura de requisição nunca valida resposta).

---

## Achado 2 — `LOLA_DATA_SERVICE_URL` aceitava faixa link-local (Médio, corrigido)

**Arquivo:** `src/server/internalClient.ts` (validação no construtor).

A validação bloqueava esquema inválido, credencial, query/fragmento e `http://`
fora de loopback sem opt-in — mas **`https://` para qualquer literal IP passava**,
inclusive `https://169.254.169.254/`. E com `LOLA_INTERNAL_PLAINTEXT=true`
(legítimo em rede privada), também `http://169.254.169.254/` passava. Todos os
metadata services de nuvem (AWS/GCP/Azure) servem em `169.254.169.254`.

**PoC:** `LOLA_DATA_SERVICE_URL=https://169.254.169.254` (ou
`http://…` + `LOLA_INTERNAL_PLAINTEXT=true`) — o servidor sobe, e toda requisição
de pré-pedido da vitrine, com nome/telefone/endereço da cliente em claro no
corpo, é enviada ao metadata service do hipervisor. O risco não vem do visitante
(a URL é só de ambiente), mas de typo ou variável de deploy comprometida.

**Correção:** `internalClient.ts:63-84` e `:137-142` — `BlockList` com
`169.254.0.0/16` e `fe80::/10`; literal link-local (incluindo a forma
IPv4-mapeada `::ffff:169.254.x.x`) é **recusado no boot**, para http e https,
sem opt-in. Nenhum servidor de dados legítimo mora em link-local, então o custo
para deploys existentes é zero. `.env.example` atualizado.

---

## Achado 3 — `data-server.ts` mudo sobre chave administrativa ausente (Baixo, corrigido)

**Arquivo:** `data-server.ts:145-155`.

O `server.ts` em modo embutido já avisava no boot (`admin.desativado`,
`server.ts:157-162`), mas o `data-server.ts` — o processo que **deveria** ter a
`LOLA_ADMIN_API_KEY` — montava o painel sem nenhum sinal quando a chave está
ausente ou com menos de 32 caracteres. As rotas respondem `401` uniforme (VUL-11,
correto: sem oráculo), mas o operador só descobria testando o painel.

**Correção:** warning `admin.desativado` na subida do `data-server.ts`, com a
mesma semântica do modo embutido. Nenhuma mudança de comportamento HTTP.

---

## Verifiquei e está limpo — as 14 perguntas

### Replay e assinatura

**1. O nonce é gravado ANTES ou DEPOIS de validar a assinatura?**
**DEPOIS — limpo.** `internalAuth.ts`: a assinatura é conferida em
`internalAuth.ts:250` (`timingSafeEqual`) e o nonce só entra no mapa em
`internalAuth.ts:267`, três linhas depois. Um flood de nonces inválidos nunca
escreve na tabela: cada requisição inválida custa só um `reject` com log
orçamentado (`internalAuth.ts:190-217`, teto de 20 linhas/s com contagem do
suprimido). A tampa `nonce_esgotado` (`internalAuth.ts:266`) é falha fechada e
só atinge quem tem a chave. Teste: `internalAuth.test.ts` ("recusa: nonce
reenviado", "mantém o canal fechado quando a chave configurada é curta").

**2. O nonce é descartado após uso? Volta a valer após expirar o skew?**
**Limpo.** O nonce usado fica no mapa até `agora + 3×skew`
(`internalAuth.ts:174`, `:238`) e a expiração é varrida periodicamente
(`internalAuth.ts:258-263`). O replay tardio é barrado pela **janela de
timestamp** antes do nonce: `|agora − ts| > skew` recusa em
`internalAuth.ts` (checagem de timestamp, anterior à de assinatura). O pior
caso de reaproveitamento de ts válido é `t₀ + 2×skew`; a entrada do nonce vive
`3×skew > 2×skew`. Não existe janela em que o nonce "ressuscite" com o ts
ainda válido.

**3. A assinatura cobre o corpo inteiro ou só metadados?**
**Corpo inteiro — limpo.** `canonicalString` inclui `sha256hex(bytes crus do
corpo)` (`internalAuth.ts:52-66`), calculado sobre o Buffer de `express.raw`
(`internalAuth.ts:244-247`), nunca sobre objeto re-serializado. Alterar um
byte de um corpo de 16 kB invalida o HMAC (teste "não é forjável por assinatura
válida em texto puro" e "corpo alterado depois de assinar"). O teto de 16 kB é
do body-parser (`internalRoutes.ts`, `express.raw({limit:'16kb'})`), aplicado
antes da autenticação.

**4. Campo fora da assinatura mutável pelo atacante?**
**Limpo.** Cobertos: versão do protocolo, ts, nonce, método (em caixa alta),
caminho e digesto do corpo. Query string é **recusada** por completo
(`internalAuth.ts`, `reject('query_string')`), então não há caminho de
ambiguidade de normalização. Headers HTTP (Host, Content-Type) não são cobertos,
mas: o destino do `fetch` vem só do ambiente e redirect é recusado; o
data-server não tem virtual hosts nem negociação por Content-Type
(`express.raw({type:'*/*'})` aceita qualquer mídia e o HMAC cobre os bytes).
Na resposta (agora assinada — Achado 1) cobre nonce + status + corpo.

### Falha aberta vs. fechada

**5. Catálogo de `catch`: passa ou recusa?**
Todos **recusam** (fail-closed):

| Local | `catch`/falha | Resultado |
|---|---|---|
| `internalClient.call` (`:244`) | rede/timeout/redirect | `{ok:false}` → chamador decide |
| `internalClient.readCappedBody` (`:131`) | erro de leitura | `null` → `ok:false` |
| `internalClient` verificação de resposta (`:224-226`) | sem assinatura válida | `ok:false` (novo) |
| `HttpDataPlane.createDraft` (`httpDataPlane.ts:184-191`) | `ok:false` | **503** `PEDIDOS_INDISPONIVEL` |
| `HttpDataPlane.createDraft` (`:199-209`) | resposta fora do contrato | **503** |
| `HttpDataPlane.fetchSnapshot` (`:162-176`) | `ok:false` ou snapshot malformado | stale limitado, senão `null` |
| Rotas do `server.ts` (`:272-273`, `:297-300`, `:306-307`, `:338-339`, `:360-361`) | `plane.snapshot().catch(() => null)` / `createDraft().catch(() => null)` | **503** |
| `internalRoutes` (`/estoque`, `/pedidos`) | erro do plano | **503** JSON |
| `adminAuth` (`:49-55`, `:70-73`) | chave ausente/errada | **401** uniforme |
| `ipAllow.resolveAdminAllowlist` (`:96-114`) | entrada inválida no env | cai para faixa privada (restritivo) |
| `rateLimit` (`rateLimit.ts:112-121`) | tabela cheia | **429** (VUL-F, já corrigido) |
| Tratador de erro final (`data-server.ts:153-166`) | exceção não tratada | **500** JSON genérico (VUL-B, já corrigido) |

Nenhum caminho de erro devolve dado stale como se fosse fresco sem janela
limitada, e nenhum devolve HTML/stack.

**6. Data-server cai: 503 ou preço/estoque velho sem avisar?**
**503, com uma janela stale explícita e limitada.** `createDraft` é sempre
falha fechada: sem resposta utilizável → **503** (`httpDataPlane.ts:189-191`),
idem no `server.ts:297-299`. As rotas de leitura (`/api/estoque/:id`,
`/api/produtos`, `/api/produto/:id`, `/api/ai/consulta`) devolvem **503**
quando o snapshot é `null`. **Preço nunca fica velho**: preços vêm do catálogo
estático do `server.ts`, o snapshot só traz números de disponibilidade
(`sanitizeStock` aceita apenas ids do catálogo e inteiros em faixa,
`httpDataPlane.ts:51-68`). O log `plano.snapshot_defasado` é emitido a cada
servida stale (throttled).

**7. `LOLA_SNAPSHOT_TTL_MS`/`_STALE_MS` vendem a mesma unidade duas vezes?**
**Não.** O stale serve só **exibição** (`httpDataPlane.ts:151-160`, janela
 padrão 60s, teto de clamping 1h). A autoridade é sempre o `data-server`:
`LocalDataPlane.createDraft` valida e **reserva atomicamente** com
`inventory.placeHold` (`dataPlane.ts:95-110`) contra o saldo real; se a unidade
já saiu, o pedido é recusado com 409/422 do próprio saldo autoritativo. Oversell
impossível; o pior caso é a cliente ver "disponível" e ser recusada no
checkout — indisponibilidade, não duplicação. Se o data-server cai por mais
que `staleMs`, `fetchedAt` envelhece e os endpoints passam a responder 503.

### API administrativa

**8. Allowlist cobre IPv4-mapeado em IPv6?**
**Sim — limpo.** `ipAllow.ts:37-41` (`normalize`) devolve
`['1.2.3.4', '::ffff:1.2.3.4']` e `check` testa as duas grafias com a família
correta (`ipAllow.ts:120-128`). Verificado no runtime: `BlockList.check` com
grafia pontuada mapeada e família errada retorna `false`, por isso a dupla
candidatura. Um endereço público em forma hex mapeada (`::ffff:cb00:7109`) não
bate com nenhuma entrada das faixas padrão → **negado** (falha fechada nos dois
sentidos: o administrativo legítimo passa; o público forjado não). Teste
`ipAllow.test.ts` ("trata endereço IPv4 mapeado em IPv6 como o mesmo host").

**9. Chave ANTES de origem?**
**Confirmado.** As três rotas montam `requireAdminKey, requireTrustedOrigin`
(`adminRoutes.ts:44`, `:57`, `:64`). Quem não tem a chave recebe o mesmo 401 de
sempre e não aprende como a rede é fatiada; o 403 de origem só existe para quem
já provou a chave (necessário para o painel dar feedback).

**10. Chave errada: mesmo tempo e mesmo corpo?**
**Sim — limpo.** Todo caminho de recusa devolve `401` com a MESMA mensagem
(`ADMIN_UNAVAILABLE_MESSAGE`, `adminAuth.ts:13`), inclusive "chave não
configurada" (`:49-55`) — teste "não revela se a chave administrativa está
configurada". A comparação roda **sempre** em buffers de comprimento igual
(`padToLength`, `adminAuth.ts:22-27`, `:64-68`) — VUL-M já corrigido, sem
oráculo de comprimento. Diferença residual: o caminho "não configurada" pula o
`timingSafeEqual` (microssegundos, não mensurável pela rede) e o corpo é idêntico;
aceitável. O log interno distingue (`auditAdminAccess`), mas log não é
observável pelo atacante.

**11. Rate limit nas rotas admin? Força bruta possível?**
**Existe.** `adminAuth.ts:37-43`: 10 tentativas por minuto por IP do socket,
tabela com teto e comportamento fechado, `Retry-After` na 429 — e a chave
correta também é bloqueada durante a janela após 10 erros (lockout por IP,
comportamento pretendido e testado em `adminAuth.test.ts:106-122`). Sobre
chave de 32+ caracteres, força bruta é matematicamente inviável mesmo sem o
limite. A chave de bucket usa o IP do socket (`req.socket.remoteAddress`), não
`X-Forwarded-For`, então não é forjável nem quando o `server.ts` embutido tem
proxy declarado. Ver a seção de decisões sobre o efeito colateral no painel
ativo.

### SSRF / configuração

**12. `LOLA_DATA_SERVICE_URL` validada? Metadata service?**
**Era o Achado 2 (corrigido).** Antes: qualquer `https://` passava, inclusive
`169.254.169.254`, e `http://` link-local passava com
`LOLA_INTERNAL_PLAINTEXT=true`. Agora: literal link-local (`169.254.0.0/16`,
`fe80::/10`, forma pontuada ou IPv4-mapeada) é recusado no boot
(`internalClient.ts:137-142`), além de toda a validação prévia (esquema,
credencial, query, fragmento, http-fora-de-loopback). A URL vem **exclusivamente
do ambiente** — nenhuma requisição de visitante influencia destino (anti-SSRF
por construção). Restam como decisão de operação: hostname de destino resolve
via DNS (não auditável estaticamente) e portas erradas em hosts legítimos.

**13. O `fetch` segue redirect?**
**Não — limpo.** `redirect: 'error'` (`internalClient.ts:202`): um `3xx` do
data-server vira exceção → `{ok:false}` → 503/stale. Teste "não segue
redirect" (`internalClient.test.ts`). Efeito colateral documentado: um
`301` de barra final real do servidor de dados derrubaria o canal — os handlers
atuais não redirecionam.

**14. Timeout aborta de verdade?**
**Sim — limpo.** `AbortSignal.timeout(this.timeoutMs)` (`internalClient.ts:203`)
cancela o `fetch` **e** a leitura do corpo (o sinal está ligado ao stream da
resposta em undici; `readCappedBody` propaga o erro → `null` → `ok:false`). O
tempo é total, cobre também corpo que chega devagar. Teste "aborta quando o
servidor de dados não responde". Clamp de 100 ms a 30 s com default 3 s
(`internalClient.ts`, construtor). Além disso a resposta é cortada em 64 kB
(`readCappedBody` cancela o reader), então nem corpo gigante nem socket
pendurado sobrevivem ao teto.

---

## Decisões de deploy/configuração (NÃO corrigidas de propósito)

1. **Ordem de deploy do Achado 1 (obrigatória):** publicar primeiro o
   `data-server.ts` novo e só então o `server.ts` novo. Um data-server novo
   com vitrine antiga funciona (a vitrine ignora o cabeçalho extra); vitrine
   nova com data-server antigo marca **toda** chamada interna como
   `assinatura_resposta_invalida` → loja em 503. Se os dois processos forem o
   mesmo artefato, o deploy atômico já resolve.
2. **`x-lola-resp-sig` via TLS/proxy:** o header é metadado assinado, não
   segredo; proxies que preservam headers não afetam. Nada a fazer.
3. **Lockout admin de 10 req/min por IP (`adminAuth.ts:37-43`):** conta
   requisições bem-sucedidas também, então um painel muito ativo (mais de 10
   chamadas/min no mesmo IP) recebe 429 mesmo com a chave correta. Trocar para
   "contar só falhas" enfraqueceria o lockout e o teste que garante
   `adminAuth.test.ts:106-122`. **Decisão do operador:** se o painel real
   estourar, subir `maxRequests` do middleware ou separar buckets de sucesso e
   fracasso.
4. **Nonce cache é em memória (`internalAuth.ts`):** restart do data-server
   limpa a tabela; um replay de requisição capturada só voltaria a valer se o
   ts ainda estiver na janela (≤ `LOLA_INTERNAL_SKEW_MS`, padrão 30 s). Risco
   residual irrisório e aceito; para eliminá-lo seria preciso persistir nonces
   (custo/complexidade desproporcional).
5. **`LOLA_SNAPSHOT_STALE_MS` e TTL altos:** os clamps permitem stale de até
   1 h e TTL de até 10 min. Oversell continua impossível (item 7), mas a
   exibição pode ficar defasada. Recomendação: manter os padrões (5 s / 60 s).
6. **TLS no data-server continua opt-in** (`LOLA_TLS_CERT_FILE`/`_KEY_FILE`);
   sem ele, PII e `x-admin-key` transitam em claro na rede privada. A assinatura
   impede forja/replay, não leitura. Ativar TLS em qualquer destino que não
   seja loopback na mesma máquina — decisão de infra.
7. **Faixa `169.254.0.0/16` na allowlist padrão do painel**
   (`ipAllow.ts:19`): quem esteja on-link com endereço link-local e alcance o
   bind do data-server disputa a chave a 10 tentativas/min. Mantida de propósito
   (dial-in de rede privada); se o painel for sempre de uma rede RFC1918
   específica, restringir `LOLA_ADMIN_ALLOWED_IPS` é um ganho fácil.
8. **`LOLA_INTERNAL_PLAINTEXT=true`:** continua existindo como opt-in; com o
   Achado 2 corrigido não alcança mais metadata services, mas ainda envia PII em
   claro para o host configurado. Preferir TLS.

---

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/server/internalAuth.ts` | `x-lola-resp-sig`, `signInternalResponse`, `verifyInternalResponse` (comparação em tempo constante) |
| `src/server/internalRoutes.ts` | wrapper em `res.json` assinando toda resposta autenticada |
| `src/server/internalClient.ts` | verificação da resposta (nonce/status/corpo); recusa de faixa link-local na URL base |
| `data-server.ts` | warning `admin.desativado` no boot quando a chave administrativa falta/é curta |
| `.env.example` | nota sobre recusa de link-local em `LOLA_DATA_SERVICE_URL` |
| `src/server/__tests__/internalAuth.test.ts` | testes unitários dos helpers de resposta |
| `src/server/__tests__/internalClient.test.ts` | protocolo de resposta assinada, link-local, PoCs de MITM ponta a ponta |
| `src/server/__tests__/internalRoutes.test.ts` | assinatura presente em respostas de sucesso e de erro |
