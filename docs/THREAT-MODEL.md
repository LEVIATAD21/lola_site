# Modelo de ameaças — LOLA Tech

STRIDE por componente, aplicado sobre o que **existe no código**, com referência
`arquivo:linha`. Este documento não reabre nenhuma decisão de
`lola_coord/DECISIONS.md` e não substitui `docs/ARCHITECTURE.md`.

---

## 1. Escopo e método

**O que é analisado:** as sete superfícies que sustentam a loja — vitrine
pública (`server.ts`), servidor de dados (`data-server.ts`), canal interno
assinado (`src/server/internalAuth.ts` / `internalClient.ts`), API
administrativa (`src/server/adminRoutes.ts`), armazenamento cifrado
(`src/server/orders.ts`), fluxo de checkout e o chat com Gemini
(`server.ts`, rota `POST /api/ai/consulta`).

**Como:** para cada superfície, primeiro os atacantes plausíveis, depois o
STRIDE aplicado **só onde a categoria cabe**, com o controle existente e a
lacuna — se houver. Onde a superfície está fechada, o documento diz que está
fechada e por quê. Lacuna inventada para preencher linha é pior que lacuna
ausente: gera trabalho errado na onda de remediação.

**Escala de severidade:**

| Severidade | Significado |
|---|---|
| **Crítica** | Perda de dados de cliente ou de dinheiro, explorável hoje |
| **Alta** | Explorável hoje com efeito relevante, ou impede o lançamento |
| **Média** | Explorável sob condição de configuração/rede, ou dano limitado a custo/disponibilidade |
| **Baixa** | Janela estreita, pré-requisito improvável ou efeito de negócio |
| **Info** | Registrado para registro, sem ação imediata |

---

## 2. Ativos

| Ativo | Onde vive | Se perder, o que acontece |
|---|---|---|
| Pré-pedidos com PII (nome, telefone, endereço) | `.data/orders.enc.json`, cifrado — só no servidor de dados | Vazamento de dado pessoal, LGPD art. 46 |
| Chave AES-256-GCM dos pedidos | ambiente do servidor de dados ou arquivo externo (`LOLA_ORDERS_KEY_FILE`) | Torna legível todo o arquivo, inclusive o do backup |
| `LOLA_INTERNAL_SECRET` | ambiente dos **dois** processos | Permitir forjar e responder o canal interno |
| `LOLA_ADMIN_API_KEY` | ambiente do servidor de dados | Leitura e alteração de estoque, leitura de toda a PII, anonimização/exclusão |
| Estoque (verdade) | `InventoryStore`, em memória + disco do servidor de dados | Oversell, venda de peça inexistente |
| Catálogo/preços (`CATALOG_INFO`) | compilado no processo | Preço errado no caixa — **é a autoridade monetária** |
| Saldo da conta de IA (`GEMINI_API_KEY`) | ambiente da vitrine | Custo indevido no provedor |
| Disponibilidade do checkout | vitrine + canal + servidor de dados | Loja aberta sem conseguir registrar venda |
| Log de auditoria administrativa | stdout estruturado | Perda de rastro de quem mexeu em PII |

---

## 3. Quem ataca (plausível nesta casa)

Loja pequena de semijoias. Não há APT, não há espionagem industrial e não há
funcionário malicioso interno — a "empresa" de TI é uma máquina exposta e um
grupo de gente remota. Os atacantes reais são estes:

| Atacante | Motivo | Superfícies que toca |
|---|---|---|
| **Visitante anônimo automatizado** (script kiddie, scanner, raspador) | varrer, explorar, raspagem de catálogo, gerar conta/ruído | vitrine, `/api/*` |
| **Cliente mal-intencionada** | preço errado, item de graça, reservar estoque para bloquear | checkout, IA |
| **Site de terceiro no navegador da vítima** | consumir a cota da vítima, forjar escrita | escritas `POST` da vitrine |
| **Atacante na rede privada entre os dois processos** (LAN, VPC, host vizinho, VM comprometida) | forjar confirmação de pedido, ler estoque, ler PII | canal interno |
| **Quem alcança a rede privada do servidor de dados** | ler PII e estoque | API administrativa |
| **Quem lê disco/backup sem ser o operador** | PII em repouso | `.data/` |
| **Rival/scraper** | copiar catálogo, queimar a IA | catálogo, `/api/ai/consulta` |

**Não é atacante plausível aqui:** quem tem `root` na máquina do servidor de
dados (nessa posição nada de software defende), e quem controla o provedor de
nuvem inteiro.

---

## 4. Vitrine pública — `server.ts`

**Ativos:** catálogo/preços (autoridade monetária), disponibilidade da loja,
cota de IA, e o próprio navegador da cliente.
**Atacante:** visitante anônimo automatizado, cliente mal-intencionada, site
de terceiro no navegador da vítima.

| STRIDE | Ameaça | Controle existente | Lacuna |
|---|---|---|---|
| **T**ampering | Cliente manda `price`/`unitPriceCents` e altera o que paga | preço nunca sai do corpo: `orders.ts:202` (unitPrice do catálogo), totais em `orders.ts:223-249`; no modo dividido o corpo vai só como repasse ao servidor de dados, que revalida (`dataPlane.ts:84-90`) | nenhuma nesta superfície |
| **T**ampering | Escrita cross-site: site malicioso dispara `POST` contra a visitante e queima a cota dela | guarda de origem **antes** dos limites: `server.ts:207` + `requestGuard.ts:23-42` (Origin vs Host, malformado → 403) | nenhuma |
| **T**ampering | Encher corpo/JSON malformado para esgotar memória e furar os limites | `express.json({ limit: '16kb' })` `server.ts:221`; orçamento bruto por IP **antes** do parser: `server.ts:214-219` | nenhuma |
| **S**poofing | Fingir ser outra origem/IP para renovar bucket de limite | `trust proxy` só se declarado (`server.ts:186-187`); chave padrão é `req.ip` que honra `trust proxy` só quando configurado (`rateLimit.ts:58-60`) | nenhuma, desde que `LOLA_TRUSTED_PROXY` não seja declarado sem necessidade |
| **S**poofing | Painel administrativo encontrado na vitrine | não montado em modo dividido (`server.ts:56`, `server.ts:545-550`); `/internal` e `/api` desconhecidos caem em 404 idêntico (`server.ts:556-562`) — verificado ao vivo, §11 | nenhuma |
| **D**oS | Inundar a API, raspar catálogo, esgotar CPU com filtros | orçamento global 600/min (`server.ts:214-219`), leitura 300/min (`server.ts:254-259`), escrita de pré-pedido 10/min (`server.ts:223-227`), IA 20/min + 120/h + 400/dia (`server.ts:228-246`); recusa de bucket novo é falha fechada (`rateLimit.ts:102-122`); canônico de caminho impede um bucket por grafia (`rateLimit.ts:20-41`) | **Média (custo)** — ver §12, L2 |
| **I**nfo | Stack trace/HTML com arquivo e linha na resposta | tratador JSON no fim da cadeia (`server.ts:593`, `httpError.ts`); 404 de API é JSON (`server.ts:560-562`); `x-powered-by` desligado (`server.ts:183`) | nenhuma |
| **I**nfo | Vazamento de chave da IA no log de erro do SDK | só a mensagem é logada (`server.ts:494-498`) | nenhuma |
| **I**nfo | XSS armazenado via dados do cliente reexibidos | entrada recusa `<>` (`orders.ts:101-108`, checagem de tabela `orders.ts:135-137`); CSP `script-src 'self'` em produção (`securityHeaders.ts:29-42`); nenhum `dangerouslySetInnerHTML` no front | nenhuma |
| **R**epudiation | Alegar que a resposta da loja foi adulterada | cada resposta de `/api` sai com `Cache-Control: no-store` (`server.ts:198-201`); log de requisição por evento, sem corpo (`server.ts:202-203`) | Info — a loja não autentica cliente nenhum (por design; é vitrine anônima), então não há o que repudiar além do registro do pré-pedido |
| **E**levation | Subir com painel ou canal internos na vitrine | decisão de montagem no boot, nunca por requisição (`server.ts:40-65`); em produção o painel embutido exige `LOLA_EMBEDDED_ADMIN=true` (`server.ts:56`) | nenhuma |
| **E**levation | Modo dev exposto servindo código-fonte pelo Vite | só fora de produção (`server.ts:565-584`) com aviso `dev.exposto` no log (`server.ts:580-584`) | **Info** — se `NODE_ENV` ficar errado numa máquina exposta, a ferramenta de dev vira superfície. Verificação de ambiente é a única trava |

---

## 5. Servidor de dados — `data-server.ts`

**Ativos:** PII dos pré-pedidos, chave de cifra, chave administrativa, verdade
do estoque.
**Atacante:** quem alcança a rede privada; quem tem `root` não é atacante
plausível (nada de software o segura).

| STRIDE | Ameaça | Controle existente | Lacuna |
|---|---|---|---|
| **S**poofing | Processo errado chamando o canal | não sobe sem segredo de 32+ caracteres (`data-server.ts:51-57`) | nenhuma |
| **S**poofing | Origem administrativa forjada por header | **sem** `trust proxy` nenhum: a allowlist lê o endereço do socket, que o chamador não escolhe (`data-server.ts:102-105`, `adminRoutes.ts:38`) | nenhuma |
| **T**ampering | Alguém troca o papel do processo (vitrine × dados) por requisição | modo decidido no boot (`server.ts:40-44`); este processo não serve estático, não serve SPA, não tem CORS (`data-server.ts:26-36`) | nenhuma |
| **D**oS | Inundar o canal antes de validar assinatura | rate limit por IP de socket **antes** do raw e da autenticação (`internalRoutes.ts:49-55`); corpo cru de 16 kB (`internalRoutes.ts:60`); recusa de requisição assinada não loga sem orçamento — 20/s com contagem do suprimido (`internalAuth.ts:183-213`) | nenhuma |
| **I**nfo | Bind em endereço coringa em produção publicando tudo | recusa explícita sem `LOLA_ALLOW_WILDCARD_BIND=true` (`data-server.ts:59-67`) | nenhuma |
| **I**nfo | PII e `x-admin-key` em claro na rede privada | TLS opcional e validado como função testável (`data-server.ts:170-172`, `envConfig.ts:55-75`); servidor criado à mão para TLS ser real, não ignorado (`data-server.ts:195-205`); aviso alto se bind não for loopback sem TLS (`data-server.ts:174-180`) | **Média (configuracional)** — ver §12, L3 |
| **I**nfo | Expor por que os pedidos estão indisponíveis (oráculo de configuração) | motivo só no log (`dataPlane.ts:166-173`); resposta 503 genérica | nenhuma |
| **D**oS | Chegar sem ser declarado e receber HTML/listagem | tudo fora do declarado é 404 JSON (`data-server.ts:153-158`) | nenhuma |

---

## 6. Canal interno assinado — `internalAuth.ts` / `internalClient.ts`

**Ativos:** integridade e autenticidade das respostas de estoque e de
pré-pedido; o segredo HMAC.
**Atacante:** quem está na rede privada entre os dois processos — o pressuposto
inteiro do desenho é que **essa rede não é confiável** (`internalAuth.ts:5-29`).

| STRIDE | Ameaça | Controle existente | Lacuna |
|---|---|---|---|
| **S**poofing | Vitrine falsa chamando o servidor de dados | HMAC-SHA256 por requisição sobre versão + timestamp + nonce + método + caminho + digesto do corpo (`internalAuth.ts:65-78`) | nenhuma |
| **S**poofing | Atacante fingindo ser o servidor de dados | resposta assinada: HMAC sobre nonce + status + digesto (`internalAuth.ts:91-102`), verificado em tempo constante (`internalAuth.ts:110-119`, chamado em `internalClient.ts:220-227`) | nenhuma |
| **T**ampering | MITM altera um byte do corpo, troca o caminho ou o verbo | tudo isso está dentro da cadeia canônica (`internalAuth.ts:65-74`); comparação em tempo constante com checagem de comprimento (`internalAuth.ts:245-252`) | nenhuma |
| **T**ampering | MITM rebaixa/upgrade o status (409 → 201) | status está no HMAC da resposta (`internalAuth.ts:94`) — verificado ao vivo, §11 | nenhuma |
| **T**ampering | Replay dentro da janela | timestamp com janela de ±30 s (`internalAuth.ts:234`) + nonce de uso único (`internalAuth.ts:256`) | nenhuma |
| **T**ampering | Redirect reescreve o destino da assinatura | `redirect: 'error'` (`internalClient.ts:201-203`) | nenhuma |
| **T**ampering | URL do vizinho vinda de header/query/corpo (SSRF) | base vem só do ambiente, fixada no boot (`internalClient.ts:15-16`, `server.ts:113-118`); credencial na URL recusada (`internalClient.ts:131-136`); `..`, query e esquema recusados no caminho (`internalClient.ts:35`, `169-177`); faixa link-local (metadata service de nuvem) recusada (`internalClient.ts:73-85`, `137-142`) | nenhuma |
| **I**nfo | PII em claro entre os processos | `http://` fora de loopback recusado por padrão; ligar exige `LOLA_INTERNAL_PLAINTEXT=true` com aviso explícito de que a assinatura não esconde dado, só impede forja (`internalClient.ts:143-155`) | **Média (configuracional)** — se quem opera ligar `PLAINTEXT` sem rede privada de verdade, a assinatura não impede leitura. O aviso existe, a decisão é do operador |
| **I**nfo | Resposta gigante estourando memória da vitrine | teto de 64 kB lido em blocos e cancelado no limite (`internalClient.ts:87-108`, `206-208`); corpo de requisição limitado a 16 kB (`internalClient.ts:32`, `190-192`) | nenhuma |
| **I**nfo | Resposta forjada passando por JSON utilizável | autenticidade **antes** da forma, depois JSON estrito de objeto (`internalClient.ts:214-237`); no plano, estoque só aceita ids do catálogo e inteiros em faixa, em objeto sem protótipo (`httpDataPlane.ts:51-68`); projeção do pedido rejeita campo a mais (`httpDataPlane.ts:98-105`) | nenhuma |
| **D**oS | Flood sem assinatura enche o log e o mapa de nonces | orçamento de log de recusa (`internalAuth.ts:183-213`); cache de nonce só ocupa espaço **depois** de assinatura válida (`internalAuth.ts:254-256`); cache cheio → recusa em vez de evacuar nonce vivo (`internalAuth.ts:263-266`) | nenhuma |
| **E**levation | Montar o canal com chave fraca num refactor | middleware montado com segredo < 32 recusa tudo, igual sempre (`internalAuth.ts:157-169`); o servidor nem sobre (`data-server.ts:51-57`) | nenhuma |

**Lacuna residual (Baixa):** o cache de replay é memória de processo
(`internalAuth.ts:175`). Reinício do servidor de dados zera o mapa; uma
requisição assinada capturada só voltaria a valer se o reinício acontecesse
dentro da mesma janela de 30 s. Janela real minuscula e exige atacante já na
rede. Hoje a loja é um processo por metade — sem efeito prático.

---

## 7. API administrativa — `adminRoutes.ts` (+ `adminAuth.ts`, `ipAllow.ts`)

**Ativos:** toda a PII de uma vez, verdade do estoque, exclusão/anonimização.
**Atacante:** quem alcança a rede privada do servidor de dados, e o dono da
chave com credencial vazada.

| STRIDE | Ameaça | Controle existente | Lacuna |
|---|---|---|---|
| **E**levation | Chave errada/ausente abrindo rota | middleware de chave em **todas** as rotas (`adminRoutes.ts:34`, aplicado em `:47,60,67,89,108,123`), comparação em tempo constante sempre com os dois buffers do mesmo comprimento (`adminAuth.ts:64-73`) | nenhuma |
| **E**levation | Oráculo para adivinhar se a chave existe | chave ausente/curta responde exatamente o mesmo 401 de chave errada (`adminAuth.ts:49-55`, `:70-73`) — verificado ao vivo, §11 | nenhuma |
| **E**levation | Adivinhar a chave por tentativa | 10 tentativas/min por IP de socket (`adminAuth.ts:37-43`), chave mínima de 32 caracteres (`server.ts:155-156`, `data-server.ts:144-150`) | nenhuma |
| **S**poofing | Qualquer host da rede fazendo operação | allowlist de origem por endereço de socket, ordenada **depois** da chave para não revelar a segmentação (`adminRoutes.ts:24-25`, `37-44`); padrão é a faixa privada (`ipAllow.ts:14-23`); entrada inválida na lista derruba para a faixa privada, nunca para "deixa passar" (`ipAllow.ts:96-114`) | **Baixa** em modo embutido atrás de balanceador — ver §12, L4 |
| **I**nfo | Vazar PII para fora do painel | não existe CORS neste processo (`data-server.ts:27-28`): a chave nunca passa por navegador; rota de titular limita a 100 registros na resposta (`adminRoutes.ts:95-101`) | nenhuma |
| **I**nfo | Número de pré-pedido forjado/enumeração malformada | formato fixo antes da busca (`adminRoutes.ts:9`, `:68-70`, `:109-111`, `:124-126`) | nenhuma |
| **R**epudiation | Ninguém saber quem mexeu em PII | `auditAdminAccess` em toda entrada, com IP mascarado (`adminAuth.ts:53,71,75`; `adminRoutes.ts:40`; `logger.ts:173-176`) | **Baixa** — o log vai para stdout: se não houver coleta persistente, não sobra rastro. Depende de quem opera (fora do código) |
| **T**ampering | Allowlist contornada por `X-Forwarded-For` | sem `trust proxy` no processo (`data-server.ts:102-105`) | nenhuma |

**Sem lacuna estrutural nesta superfície.** As duas travas são independentes,
a ordem é a certa (chave → origem) e nenhuma resposta diferencia o caso.

---

## 8. Armazenamento cifrado — `orders.ts`

**Ativos:** PII de quem pediu; a chave que a torna legível.
**Atacante:** quem lê disco ou backup sem ser o operador; quem tem `root` na
máquina não é atacante plausível.

| STRIDE | Ameaça | Controle existente | Lacuna |
|---|---|---|---|
| **I**nfo | Ler `.data/orders.enc.json` | AES-256-GCM, envelope com IV novo a cada gravação (`orders.ts:610-625`); arquivo `0600` e diretório `0700` (`orders.ts:482`, `524`, `622-623`) | nenhuma |
| **I**nfo | Trocar/encaixar envelope de outro lugar (desfazer exclusão) | AAD amarra a cifra a este arquivo (`orders.ts:334-346`, aplicado em `:615`, `:533`) | nenhuma |
| **I**nfo | Chave junto do ciphertext no backup (cópia leva os dois) | em produção a chave vem de fora do diretório (`orders.ts:459-474`) e **sem chave o serviço não registra pedido** (`orders.ts:478-479`); arquivo de chave exige `0600` em produção, senão é rejeitado (`orders.ts:468-474`) | nenhuma |
| **I**nfo | Chave local criada em dev junto dos dados | existe e é **declarada** como aceitável só em dev, com aviso (`orders.ts:504-510`) | **Info** — fora de produção. Não é lacuna de produção |
| **I**nfo | Cifra corrompida/chave trocada derrubando o processo em loop ou apagando arquivo | arquivo intacto, serviço sobe com pedidos indisponíveis e 503 genérico (`orders.ts:542-551`, `dataPlane.ts:166-173`) | nenhuma |
| **I**nfo | Dado pessoal que não precisa estar ali | minimização no próprio tipo: sem cartão, sem e-mail, sem IP, sem `giftWrap` (`orders.ts:38-53`); retenção de 90 dias com varredura na subida e de hora em hora (`orders.ts:584-608`, `dataPlane.ts:179-192`) | nenhuma |
| **I**nfo | Dado pessoal reexibido no painel depois do pedido do titular | `remove` reescreve tudo (`orders.ts:739-754`), `redact` zera os campos e mantém só a casca (`orders.ts:767-788`); falha de escrita restaura a memória para o dado não "sumir" só na RAM (`orders.ts:603-607`, `:749-753`, `:782-787`) | nenhuma |
| **T**ampering | Apagar/alterar arquivo parcialmente | escrita atômica: temporário + `rename` (`orders.ts:621-624`) | nenhuma |
| **D**oS | Encher o arquivo único | teto de 10.000 registros com aviso aos 90% e recusa explícita (`orders.ts:421-425`, `627-634`, `655-661`) | **Info** — é limite de operação, não de atacante: o ponto de falha é a falta de rotação, já visível na mensagem do log |

---

## 9. Fluxo de checkout

**Caminho:** sacola no navegador → `POST /api/pedidos/rascunho`
(`src/services/api.ts:203-229`) → guarda de origem e limites (`server.ts:207`,
`:223-227`) → plano de dados local ou remoto → `buildOrderDraft` → reserva de
estoque → persistência cifrada.

**Ativos:** preço praticado, verdade do estoque, PII do cliente.
**Atacante:** cliente mal-intencionada; site de terceiro no navegador da
vítima; na metade dividida, quem está na rede privada.

| STRIDE | Ameaça | Controle existente | Lacuna |
|---|---|---|---|
| **T**ampering | `price: 0.01` no corpo | `unitPriceCents` recalculado do catálogo do servidor (`orders.ts:202`); campo do cliente nunca é lido — verificado ao vivo, §11 | nenhuma |
| **T**ampering | Linha inexistente, quantidade absurda, produto fora do catálogo | id precisa existir (`orders.ts:195-196`), quantidade inteira 1..99 (`orders.ts:192-194`), 1 a 30 linhas (`orders.ts:181-183`) | nenhuma |
| **T**ampering | Cupom inventado/reusado sem regra | catálogo de cupons validado no servidor com subtotal real, validade, mínimo e teto de usos (`orders.ts:169-179`, `229-238`; contagem em `orders.ts:809-816`) | nenhuma |
| **T**ampering | Frete/embalagem escolhidos fora da tabela | tabela fixa no servidor (`orders.ts:241-248`), total nunca abaixo de zero (`orders.ts:249`) | **Info** — a tabela é decisão comercial (B5); não é falha de segurança |
| **T**ampering | Doze pedidos de 5 unidades contra 7 em estoque | validação + reserva atômica no mesmo handler síncrono (`dataPlane.ts:92-110`), reserva expira por TTL (`server.ts:71-73`, `dataPlane.ts:195-199`) | nenhuma |
| **D**oS | Reservar estoque para bloquear a loja | 10 pré-pedidos/min por rota (`server.ts:223-227`), teto global de 500 reservas simultâneas e 10 por origem no modo embutido (`server.ts:139-142`, `data-server.ts:92-95`), TTL padrão de 30 min (`server.ts:73`) | **Baixa** — no modo dividido o teto por origem fica desligado de propósito (`data-server.ts:88-95`), porque a origem seria a vitrine: o limite real ali é o global de 500. Para uma loja pequena, 500 reservas presas por 30 min é incômodo, não apagão |
| **D**oS | Repetir a requisição (retry de rede) gerando pré-pedido duplicado | nenhum identificador de idempotência: cada chamada cria registro novo | **Baixa** — ver §12, L6 |
| **I**nfo | PII do cliente em claro no trânsito público | TLS da vitrine (HSTS por padrão em produção, `securityHeaders.ts:43-51`); na metade dividida o transporte interno é o item L3/L do §12 | depende do deploy |
| **I**nfo | Dado pessoal armazenado desnecessário | ver §8 (minimização) | nenhuma |
| **R**epudiation | Cliente nega ter feito o pré-pedido | não há autenticação do titular por design: o pré-pedido é anônimo. Resta o número do pedido, a data e o IP mascarado no log (`dataPlane.ts:118-122`) | **Baixa** — sem cobrança (`paymentStatus` é sempre `not_configured`) não há dinheiro em disputa; a contrapartida documentada é que a loja não tem como provar autoria. Aceito para este estágio |
| **E**levation | Confirmação de pedido forjada no navegador | resposta validada campo a campo antes de mostrar totais/referência (`src/services/api.ts:169-197`) | nenhuma |

---

## 10. Chat com Gemini — `server.ts`, `POST /api/ai/consulta`

**Ativos:** custo da conta de IA, coerência das respostas da marca, texto
digitado pela cliente (dado pessoal que pode estar na pergunta).
**Atacante:** visitante querendo queimar saldo ou extrair prompt/regras internas;
site de terceiro consumindo a cota da vítima.

| STRIDE | Ameaça | Controle existente | Lacuna |
|---|---|---|---|
| **T**ampering | Prompt injection pelo `pergunta`/`contexto` alterando preço, estoque ou regras | contexto **reconstruído** só com campos do catálogo: produto precisa existir, sacola só aceita id do catálogo e quantidade 1..99 (`server.ts:388-407`); texto da cliente vai como dado, com regra explícita de não-instrução (`server.ts:441-442`, regra 8 em `server.ts:427`); o sistema inteiro ancora no catálogo ao vivo (`server.ts:415-434`) | **Baixa** — a barreira é o modelo, não um parser: parte da resposta ainda pode ser persuadida. O efeito é um texto errado na janela do chat, não escrita no caixa — preços e estoque escritos são do servidor |
| **T**ampering | `contexto` do cliente virando dado exibido | campos ignorados não passam: `sessaoCliente` não é lido; só `produtoId` e `carrinho` são considerados, e mesmo assim filtrados (`server.ts:363-407`) | nenhuma |
| **D**oS | Queimar a conta de Gemini por volume | 20/min (`server.ts:228-232`), 120/h (`server.ts:235-240`), 400/dia (`server.ts:241-246`), pergunta de 1.200 caracteres (`server.ts:370-372`), timeout de 20 s com queda para o motor local (`server.ts:249`, `:452`), guarda de origem antes do limite (`server.ts:207`) | **Média (custo)** — ver §12, L2 |
| **D**oS**/F**alha | Provedor pendurado segurando socket e slot | `AbortSignal.timeout` (`server.ts:452`) + resposta local de regras quando não há chave ou falhou (`server.ts:494-539`) | nenhuma |
| **I**nfo | Chave da API no log | só a mensagem do erro (`server.ts:494-498`) | nenhuma |
| **I**nfo | Prompt interno/`STORE_FAQS` vazando para a cliente | possível por engano do modelo; efeito é exposição de texto de política, sem segredo material — as chaves não estão no prompt | **Info** |
| **I**nfo | **Saída de dado pessoal para terceiro**: pergunta + produto + sacola vão para o Google | comentado e documentado na própria rota (`server.ts:347-359`); sem chave, nada sai da máquina (`server.ts:409-412`) | **Alta** — ver §12, L1. É a lacuna real desta superfície: não há aviso na UI nem consentimento, e nada no código impede `GEMINI_API_KEY` preenchida em produção |

---

## 11. O que já foi verificado ao vivo

Evidências desta casa, com onde a prova mora. Todas as quatro rodam contra
servidor real (boot de processo), não contra função isolada.

**1. Proxy MITM forjando `201` → recusado com `503` (`assinatura_resposta_invalida`).**
Um proxy no meio encaminha a requisição legítima e reescreve a resposta: um
`201` com número de pré-pedido inventado no lugar do `409` real. A resposta não
tem assinatura válida para aquele nonce + status + corpo, e não passa:
`src/server/__tests__/internalClient.test.ts:360-392` →
`failure: 'assinatura_resposta_invalida'`. O mesmo acontece com reescrita de
estoque (`internalClient.test.ts:330-356`). O efeito público é o `503` com
mensagem genérica de indisponibilidade do catálogo, porque a vitrine não tem
resposta utilizável: `src/server/httpDataPlane.ts:184-191`. Registro em
`docs/GO-LIVE.md:21` e `docs/auditorias/canal-interno.md`.

**2. `/internal` sem assinatura → `401`, recusado em `timestamp_formato` antes
de qualquer crypto.**
A checagem de formato do timestamp roda **antes** de o HMAC ser calculado
(`src/server/internalAuth.ts:231`, enquanto a assinatura só é verificada em
`internalAuth.ts:245-252`): requisição sem cabeçalho nenhum não gasta
comparação de segredo, e o motivo fica no log. Caso coberto em
`src/server/__tests__/internalAuth.test.ts:154-162` ("timestamp com formato que
não é milissegundos"), com asserção de `401` em `internalAuth.test.ts:199` e a
prova de que **todas** as recusas devolvem exatamente o mesmo status e o mesmo
corpo (`internalAuth.test.ts:210-223`) — sem oráculo do estado do canal.

**3. Admin com a chave certa na vitrine → `404`.**
Em modo dividido, com `LOLA_EMBEDDED_ADMIN=true` e `LOLA_ADMIN_API_KEY` de 64
caracteres válidos na variável de ambiente, `GET /api/admin/pre-pedidos` na
vitrine devolve `404` com o mesmo corpo de qualquer rota inexistente:
`src/server/__tests__/serverBoot.test.ts:363-370`. O motivo é estrutural: o
painel só monta se `MOUNT_ADMIN && localPlane`
(`server.ts:56`, `server.ts:545-550`), e o 404 de `/api` está declarado em
`server.ts:560-562`. Não existe superfície de administração na vitrine, nem
para quem tem a chave.

**4. `price: 0.01` do cliente → subtotal sai do catálogo.**
Corpo de pré-pedido com `unitPriceCents: 1` e `price: 0.01` para `brinco-1`
recebe `201` com `subtotal: 49.9` — o preço do catálogo:
`src/server/__tests__/serverBoot.test.ts:219-228`. O mecanismo é
`src/server/orders.ts:202`: o preço é recalculado a partir de
`CATALOG_INFO`, e o campo enviado pela cliente nunca é lido.

---

## 12. Lacunas consolidadas

Somente o que é lacuna de fato, em ordem de severidade. Nenhuma é
**Crítica**.

| # | Lacuna | Severidade | Por quê / o que já mitiga |
|---|---|---|---|
| **L1** | **Gemini sem aviso na UI nem consentimento** (`server.ts:347-359`): com `GEMINI_API_KEY` preenchida, texto da cliente + produto + sacola vão para o Google fora do Brasil. Nada no código impede a chave em produção (`server.ts:412`) | **Alta** | É a única lacuna que impede o lançamento por si (B3 em `BLOCKERS.md`). Conformidade, não exploração remota. Caminhos possíveis — manter com aviso ou desligar a chave — são decisão do dono, não deste documento |
| **L2** | **Sem teto global de gasto em IA**: os limites diário/horário são por IP (`server.ts:235-246`); um conjunto grande de IPs pode disparar chamadas pagas sem parar | **Média** | Dano é saldo da conta, não dado de cliente. Já existe alce de defesa por IP; falta um contador global por processo (uma linha de orçamento, não um sistema) |
| **L3** | **TLS do servidor de dados é opt-in com aviso, não trava** (`data-server.ts:174-180`): bind em IP privado sem TLS deixa `x-admin-key` e PII em claro na rede privada | **Média** | O padrão (loopback) é seguro e o aviso na largada é alto (`data-server.ts:175-179`); o TLS, quando pedido, é validado de verdade (`data-server.ts:199-205`, `envConfig.ts:55-75`). Falha aberta por escolha explícita de configuração — se o deploy for privado e segmentado, aceitável |
| **L4** | **Allowlist administrativa vira decoração atrás de balanceador** (VUL-I, `server.ts:58-65`): atrás de proxy, todo chamador aparece como IP privado e passa na faixa padrão | **Baixa** | Exige dois erros ao mesmo tempo: modo embutido **e** proxy declarado **e** `LOLA_ADMIN_ALLOW_PRIVATE_PROXY=true`. Ainda restam chave de 32+ com 10 tentativas/min (`adminAuth.ts:37-43`) |
| **L5** | **Limites e cache de replay vivem em memória, por processo** (`rateLimit.ts:67`, `internalAuth.ts:175`): múltiplas instâncias não compartilham contadores; reinício zera nonces vistos | **Baixa** | Hoje é um processo por metade, então não há efeito. Virar problema só com escala horizontal — e aí a contagem compartilhada é pré-requisito, não ajuste |
| **L6** | **Sem idempotência no pré-pedido**: retry de rede cria um registro novo | **Baixa** | Efeito é duplicata de negócio, não perda; limitado a 10/min e ao teto de reservas. Remediação já designada na onda 2 (`be-idem`, `src/server/orders.ts`) — fora do território deste documento |
| **L7** | **Rastro administrativo só em stdout** (`logger.ts:173-176`): sem coleta persistente, não sobra evidência de quem leu PII | **Baixa** | O log existe, é estruturado e com IP mascarado; falta a parte de retenção, que é operação — não código |

---

## 13. O que está bom, e por quê

Sem lacuna atribuída a estas superfícies, depois de ler o código delas:

- **Canal interno assinado nos dois sentidos.** HMAC cobre método, caminho,
  digesto do corpo e timestamp com nonce de uso único (`internalAuth.ts:65-78`);
  a resposta é assinada com o mesmo nonce e o status
  (`internalAuth.ts:91-102`), verificada em tempo constante antes de qualquer
  parse (`internalClient.ts:220-227`). Falha fechada: resposta ruim vira
  indisponibilidade, nunca conteúdo aceito (`httpDataPlane.ts:189-208`).
- **Preço nasce no servidor.** `orders.ts:202` e `orders.ts:223-249` — o corpo
  do cliente é matéria-prima de validação, nunca de valor.
- **Painel administrativo fora da vitrine**, por decisão estrutural de boot e
  não por obscuridade de URL (`server.ts:56`, `server.ts:545-550`).
- **Armadilha do oráculo fechada nos três pontos de autenticação**: chave
  administrativa (`adminAuth.ts:49-55`), recusa do canal interno
  (`internalAuth.ts:189-216`, corpo único em `internalAuth.test.ts:210-223`) e
  motivo de indisponibilidade de pedidos só no log (`dataPlane.ts:166-173`).
- **Falha fechada como padrão**: segredo curto → canal recusado
  (`internalAuth.ts:157-169`), cifra ilegível → serviço sobe sem pedidos com
  arquivo intacto (`orders.ts:542-551`), lista de allowlist inválida → faixa
  privada (`ipAllow.ts:96-114`), tabela de rate limit cheia → recusa em vez de
  evacuar bucket (`rateLimit.ts:112-121`).
- **PII em repouso**: AES-256-GCM com AAD e IV novo, arquivo `0600`,
  chave fora do diretório em produção, retenção de 90 dias com varredura e
  (`remove`/`redact`) regravando com a chave vigente (`orders.ts:584-625`,
  `:739-788`).
- **Superfície da vitrine enxuta**: sem CORS, sem proxy confiado sem declaração,
  sem rota de escrita de estoque, 404 JSON para tudo que não foi declarado
  (`server.ts:282-286`, `:556-562`), CSP e HSTS em produção
  (`securityHeaders.ts:28-51`).

---

## 14. Fora do escopo deste documento

Coisas que este documento não decide e que dependem de outras pessoas:

- **B1 — gateway de pagamento**: não existe. `paymentStatus` é sempre
  `not_configured` (`orders.ts:260`) e isso não é bug. Quando existir, este
  modelo precisa ser revisitado: a superfície de checkout passa a carregar
  dinheiro de verdade.
- **B3 — Gemini**: ver L1. A escolha entre aviso e desligamento é do dono.
- **B4 — `Dockerfile`/`compose` nunca executados**: as garantias de imagem
  (`.dockerignore` barrando `.data`, `.env*`, `*.key`) estão declaradas, mas não
  foram provadas em build real.
- **Rotação/backup da chave de cifra**: processo operacional, coberto por
  `sre-restore` (onda 1).
- **Rastreio de logs em produção**: depende de quem opera (L7).
