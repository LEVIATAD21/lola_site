# Relatório de adequação à LGPD — inventário, direitos do titular e plano executável

**Projeto:** Lola Aço Inox & Acessórios (React + Vite / Express)
**Branch:** `agente/lgpd` · **Data:** 2026-10-13
**Estado na verificação:** `npx tsc --noEmit` limpo · `npx vitest run` → **287 testes verdes** (258 existentes + 29 novos)
**Escopo legal:** Lei 13.709/2018 (LGPD). O site **não está no ar** — este é o momento de decisão estrutural.

> **Como ler:** toda afirmação traz evidência `arquivo:linha`. Onde a linha não vem de código,
> vem de `REPORT.md` como proposta. Bases legais marcadas como **provisórias** precisam da
> validação do controlador (e, se quiser, de jurista) antes do go-live — elas estão escritas para
> serem discutidas, não para serem aceitas de presente.

---

## 1. Inventário de dados (art. 6, I — finalidade; art. 9 — informação ao titular)

### 1.1 Tabela mestra

| Dado | Origem (rota · validação) | Persistência | Retenção | Terceiro | Risco |
|---|---|---|---|---|---|
| **Nome completo** (`fullName`) | `POST /api/pedidos/rascunho` (`server.ts:300`) → `createDraft` (`src/server/dataPlane.ts:75`) → `orders.ts:138` | `.data/orders.enc.json`, AES-256-GCM + AAD (`orders.ts:610-624`) | 90 d (`orders.ts:364`, `server.ts:139`) | Não sai (só admin: `adminRoutes.ts:60,89`) | **Médio** — identificador direto; único caminho de correção hoje é excluir |
| **Telefone** (`phone`) | `orders.ts:145` (só dígitos, 10–11) | Idem; **vira índice de busca** (`orders.ts:448`) | 90 d | Não sai | **Médio** — é a chave de atendimento do art. 18, mas também é a mais consultável em vazamento |
| **CEP + logradouro + nº + compl. + bairro + cidade + UF** | `orders.ts:139-146`, montagem `orders.ts:264-266` | Idem, cifrado | 90 d | **ViaCEP** recebe só o CEP, **do navegador** (`src/services/cep.ts:18`, chamado em `CheckoutPage.tsx:116`) | **Alto** — endereço é dado sensível quando revela religião/saúde/origem no complemento; texto livre de 120 chars (`orders.ts:143`) |
| **Nº do pré-pedido** (`orderNumber`) | Gerado em `orders.ts:257`; devolvido 1× no 201 (`dataPlane.ts:123`) e no modal (`OrderSuccessModal.tsx:43`) | Idem + **log em claro** (`dataPlane.ts:120-122`) | 90 d / junto com o pedido | Não | **Baixo** — identificador de negócio, mas **funciona como segredo fraco de acesso**: quem anotou, acha |
| **Itens, quantidades, totais, frete, embalagem** | `orders.ts:223-249` (preço recalculado no servidor) | Idem | 90 d | Não | **Baixo** — não são PII isolados, mas linkageiam o titular |
| **`couponCode`** | `orders.ts:169-178` | Idem (`orders.ts:269`) | 90 d (cai junto em `remove`; **fica** em `redact` — ver §3.3) | Não | **Baixo** — não é PII por si; é regra comercial |
| **`termsAccepted: true`** | Exigido `orders.ts:154` | Idem | 90 d | Não | **Baixo** — é prova de aceite, guarda por interesse legítimo |
| **IP do visitante (logs)** | `createRequestLogger` `logger.ts:141-147`; acesso admin `logger.ts:162` | stdout/ARQUIVO de log, **mascarado** (`logger.ts:35-58`, `LOLA_LOG_IP_MODE=mask` `.env.example:169`) | Definida pelo coletor/rotação do SO (fora do código) | Coletor de logs do hospedeiro | **Médio** — mascarado é `189.45.x.x`: reduz, **não elimina**; log precisa de rotação declarada |
| **IP do cliente (pré-reserva)** | `dataPlane.ts:102` → `InventoryStore.placeHold` | **Só memória** (`inventory.ts:44-48`, não é persistido) | Vence com a reserva (30 min) | Não | **Baixo** |
| **Texto digitado no chat + produto + sacola** | `ChatbotAssistente.tsx:89-92` → `POST /api/ai/consulta` (`server.ts:364`) | Não persiste no servidor | Não grava | **Google/Gemini** (`server.ts:449`, `generateContent`) | **ALTO** — ver §4.1 |
| **Carrinho, favoritos, cupom, frete** | `App.tsx:133,142,151,160` | `localStorage` do navegador | Até o cliente limpar | Não (dado no dispositivo) | **Baixo** — não é dado coletado pelo controlador |
| **Link de WhatsApp com produto/preço** | `WhatsAppModal.tsx:26` (`wa.me/?text=...`) | Não | — | **Meta** (clique do usuário) | **Baixo** — texto contém só produto e preço, sem PII (`WhatsAppModal.tsx:23`) |
| **IP do visitante → Google Fonts** | `index.html:12-14` | Não | — | **Google** (CSS/fontes) | **Médio** — IP é dado pessoal (art. 5º, I); vazamento evitável auto-hospedando |

**O que NÃO é recebido (confirmado):** cartão, CVV e validade — recusados na entrada
(`orders.ts:155-157` e teste `orders.test.ts:94-101`). Não há cadastro, e-mail, CPF, cookie de
rastreamento nem analytics de terceiros.

### 1.2 Base legal provisória, por finalidade

| Finalidade | Base legal proposta | Onde está no código |
|---|---|---|
| Registrar pré-pedido e entregar | **art. 7º, V** — execução de contrato / procedimentos preliminares a pedido do titular | comentário `orders.ts:19-33` |
| Reservar estoque e limitar cupom | **art. 7º, IX** — legítimo interesse (LIA a escrever: fraude e esgotamento artificial) | `inventory.ts:183-195`, `orders.ts:795-808` |
| Logs de segurança e auditoria | **art. 7º, IX** + **art. 15, IX** (segurança/estudo) | `logger.ts:60-70` |
| IP mascarado em log | minimização **art. 6º, III** | `logger.ts:6-14` |
| Assistente → Gemini | **art. 7º, I — consentimento** + **art. 9º, I** (aviso prévio) — **hoje não existem** | comentário `server.ts:350-363` |
| Consulta de CEP no ViaCEP | **art. 7º, V** (preparação do pedido), aviso na política | `cep.ts:18` |

---

## 2. Direitos do titular (art. 18) — o item mais importante

### 2.1 O problema de partida (respondido com código na mão)

O arquivo é **um JSON cifrado único** com **todos** os pré-pedidos
(`orders.ts:610-624` serializa `this.records` inteiro). Antes desta branch:

* busca existia **só por número** — `findByOrderNumber` (`orders.ts:667`);
* o número é entregue **uma única vez**, no 201 (`dataPlane.ts:123`) e num modal
  (`OrderSuccessModal.tsx:43`). **Não há e-mail nem SMS.** Se a cliente fechar a aba, perdeu a
  única chave de acesso → art. 18, I e V ficavam **impossíveis de atender** na prática;
* não havia como apagar um registro sem reescrever o arquivo inteiro à mão, e a "rotação" por
  `MAX_RECORDS = 10_000` (`orders.ts:423`) **não é retenção**: é teto de espaço, e não remove
  nada.

**Sobre a pergunta da chave de criptografia:** os registros **não** têm IV/chave próprios — há
**um** envelope para o arquivo inteiro com **uma** chave (`orders.ts:346`, `ORDERS_AAD`).
Rotacionar a chave **deixa todo o resto ilegível** (`orders.ts:540-553` mostra o desastre: chave
errada → store indisponível). Logo: **apagar/redigir NÃO pode depender de rotação de chave** —
reescreve-se o arquivo com a chave vigente. É exatamente o que `remove`/`redact` fazem, com
rollback se a escrita falhar (`orders.ts:739-765`).

### 2.2 Matriz de direitos

| Direito | Como atender **HOJE** | O que falta | Código mínimo / status |
|---|---|---|---|
| **I — confirmação da existência** | `GET /api/admin/titular?telefone=(21) 98765-4321` → `count` responde sim/não (`adminRoutes.ts:89-105`; busca O(1) em `orders.ts:448,680`) | **Canal de pedido do titular** (form/e-mail) e **prazo declarado** (art. 19, §3º: imediato em formato simplificado) | ✅ **Implementado** (busca + rota + testes). ❌ Canal/ROI no site |
| **II — acesso aos dados** | Mesma rota devolve `AdminOrderView` completo (`orders.ts:294-313`): cliente, itens, totais, datas | Forma de entrega ao titular (JSON é aceito; PDF/planilha é decisão) | ✅ Pronto; falta só expedir |
| **IV — correção** | **Não existe.** Só dá para excluir e refazer | Rota de edição que preserve `orderNumber`/`createdAt` | ❌ **Não implementado** — esboço na §8.3. Esforço **médio** |
| **V — portabilidade/anonimização** | Exportar em JSON a partir de `searchByTitular` (`orders.ts:714`) | Decidir se o export é automático (self-service) ou operado | ✅ Backend pronto. Self-service = decisão §8.2 |
| **VI — eliminação** | `DELETE /api/admin/pre-pedidos/:orderNumber` (`adminRoutes.ts:123`) **ou** `POST .../redact` (`adminRoutes.ts:108`) — apaga PII e mantém casca comercial | Política: qual dos dois usar em cada caso (§8.1) | ✅ **Implementado** (`remove` `orders.ts:739`, `redact` `orders.ts:767`) |
| **VII — portabilidade a outro fornecedor** | Mesmo export do V | — | ✅ via V |
| **VIII — revogação/eliminação de consentimento** | Só existe um consentimento hoje (checkbox de termos, `CheckoutPaymentMethod.tsx:183-232`); revogá-lo = excluir o pedido | Consentimento do assistente (§4.1) e mecanismo de revogação na UI | ❌ Depende das decisões §8.2 |
| **IX — informação sobre compartilhamento** | **Não publicada** (§4.2) | Política de Privacidade real | ❌ Texto pronto na §8.4 |
| **X — oposição** | Não implementada | Regra de objeção a tratamento por legítimo interesse | ❌ Esforço baixo quando houver canal |

### 2.3 O código que torna o art. 18 possível (já nesta branch)

```ts
// src/server/orders.ts:448  — índice telefone → números de pré-pedido
private readonly phoneIndex = new Map<string, Set<string>>();

// src/server/orders.ts:680  — O(1), aceita "(21) 98765-4321", "21 9 8765-4321" e "+55..."
findByPhone(rawPhone: string): StoredOrderDraft[]

// src/server/orders.ts:714  — busca única do fluxo de direitos (telefone E/OU nome, mais recente primeiro)
searchByTitular(query: { phone?: string; name?: string }): StoredOrderDraft[]

// src/server/orders.ts:739  — art. 18, VI: eliminação total, reescreve com a chave VIGENTE
remove(orderNumber: string): boolean

// src/server/orders.ts:767   — art. 18, VI: anonimiza, mantém nº/data/itens/totais + marca redactedAt
redact(orderNumber: string, now = new Date()): boolean

// src/server/orders.ts:584  — art. 15, II: expiração por retenção, com rollback em falha de escrita
purgeExpired(now = Date.now()): number

// src/server/adminRoutes.ts:89/108/123  — expõe tudo atrás de chave + allowlist
GET    /api/admin/titular?telefone=&nome=
POST   /api/admin/pre-pedidos/:orderNumber/redact
DELETE /api/admin/pre-pedidos/:orderNumber
```

**Procedimento sugerido de atendimento (custo operacional: ~2 min por pedido):**
1. titular entra em contato pelo canal publicado na política;
2. operador, com `x-admin-key`, chama `/api/admin/titular?telefone=...` → `count` responde o art. 18, I;
3. para exportar (art. 18, V), os `orders` já vêm em JSON pronto;
4. para eliminar (art. 18, VI), `DELETE` (pré-pedido que nunca virou venda) ou `redact` (quando
   o registro precisa sobreviver para auditoria de cupom/estoque);
5. tudo fica no log: `admin.access` (`logger.ts:162`) + `pedido.eliminado`/`pedido.anonimizado`
   (`adminRoutes.ts:115,130`) → atende parcialmente o art. 37.

---

## 3. Retenção e minimização (art. 15, II e VI)

### 3.1 Antes: não havia retenção
`MAX_RECORDS = 10_000` (`orders.ts:423`) é **teto de espaço**; a "rotação" recomendada no erro
(`orders.ts:631`) não apaga nada — os dados ficavam **para sempre**, até alguém trocar o arquivo.
A reserva de estoque tinha TTL (`server.ts:73`), mas o **dado pessoal não tinha**.

### 3.2 Agora
* `LOLA_ORDER_RETENTION_DAYS`, **padrão 90 dias**, faixa 0–3650 (`server.ts:139`, `data-server.ts:93`,
  `.env.example:68-76`; resolução `orders.ts:373-379`).
* Varredura **na subida e de hora em hora** (`dataPlane.ts:179-192`), com evento
  `pedidos.expirados_removidos` para o registro (art. 37).
* Data ilegível = expirada (`orders.ts:590-597`) — registro corrompido não vira eterno.
* Escrita falhou → **rollback** (`orders.ts:602-606`): apagamento que só existe na memória
  reapareceria no reboot e o operador acreditaria que apagou.
* `0` desliga (opt-in explícito, documentado como desaconselhado).

**Onde mora:** `EncryptedOrderStore.purgeExpired` (domínio) + `createLocalDataPlane`
(orchestração) + env nos dois entrypoints. Não mora em cron externo: retenção é regra de
tratamento, e quem tem os dados é quem precisa aplicá-la.

### 3.3 Campos que talvez não devessem ser gravados

| Campo | Gravado? | Veredito |
|---|---|---|
| `complement` | Sim (`orders.ts:143`) | **Manter.** Obrigatório na entrega, já opcional, limitado a 120 chars e sem markup. Risco real: texto livre aceita PII de terceiro — mitigado, não eliminado; mencionar na política |
| `giftWrap` (bool) | **Não** — só `giftWrapCents` (`orders.ts:248`) | ✅ Já minimizado |
| `couponCode` | Sim (`orders.ts:178`) | **Manter.** Sem ele o teto de usos só existe em RAM (`orders.ts:795-808`). Não é PII; cai com `remove` e **fica** em `redact` de propósito (apagá-lo liberaria o cupom a quem pedisse anonimização — comentário `orders.ts:804`) |
| `shippingOptionId` | Sim (`orders.ts:262`) | **Manter** — necessário para calcular e entregar |
| `paymentMethod` | Sim | **Manter** — sem ele não há como concluir; não é dado financeiro |
| `termsAccepted` | Sim (`orders.ts:154`) | **Manter** — prova de aceite, guarda por interesse legítimo |

**Conclusão da minimização:** não há dado jogado fora por descuido. O problema aqui era **falta
de prazo**, não excesso de campo.

---

## 4. Terceiros (art. 39 — o controlador responde pelos operadores)

### 4.1 Gemini / Google — **risco nº 1 do projeto**

* **O que sai:** `pergunta` (texto livre da cliente — capaz de conter nome, telefone, endereço),
  produto visualizado e sacola: montado em `server.ts:440-447`, enviado em `server.ts:449-458`.
* **Sai do SERVIDOR**, não do navegador: o IP que chega ao Google é o da loja (bom), mas o
  **conteúdo é da cliente** (ruim).
* **Só acontece se `GEMINI_API_KEY` estiver setada** (`server.ts:413,416`); sem chave, motor
  local — nada sai.
* **Contrato:** Google Cloud Terms of Service + Data Processing Addendum (padrão, por adesão).
  **Não há** adesão registrada neste projeto, **não há** DPAA arquivado, **não há** transferência
  internacional documentada (art. 33) e **não há** registro de operadores (art. 37, §1º).
* **Aviso ao cliente: NENHUM.** O chat começa com "Olá! Sou a assistente virtual…"
  (`ChatbotAssistente.tsx:37`) e some com a conversa para o Google sem que a cliente saiba.
* **Consentimento explícito: NENHUM.**

> **Recomendação operacional imediata, sem esperar decisão de produto: deixe `GEMINI_API_KEY`
> vazia em produção** enquanto o aviso não existir. Já está escrito em `.env.example:1-13`.
> A alternativa purista (nunca enviar) também é válida: o motor local responde sozinho.

### 4.2 Páginas de Política de Privacidade e Termos — **risco nº 2**

Existem, mas como **modais com texto que está ERRADO**:

* `SiteFooter.tsx:144-145` — "os dados informados no checkout permanecem apenas no seu
  navegador (armazenamento local) e **não são enviados a servidores**". **Falso:** o checkout
  envia nome, telefone e endereço para o servidor (`CheckoutPage.tsx:186` → `server.ts:300`).
  Uma política que mente viola art. 6º, III (verdade) e torna o consentimento do art. 7º, I nulo.
* `SiteFooter.tsx:157-158` — Termos de Uso: um parágrafo genérico, sem identificação do
  controlador, sem canal do encarregado (art. 41, §1º, II).
* `SiteFooter.tsx:170-171` — Cookies: correta sobre localStorage, mas **omite** ViaCEP,
  Google Fonts e Gemini.
* `CheckoutPaymentMethod.tsx:208-210` — texto do checkout é o **mais correto** que existe hoje
  (diz que nome/telefone/endereço vão ao servidor e ficam cifrados), mas ainda diz
  "a política completa deve ser publicada antes do lançamento".
* **Não há rota `/privacidade` nem `/termos`** — `App.tsx:34-44` só conhece home, categoria,
  produto, carrinho e checkout.

### 4.3 Outros terceiros

| Terceiro | O que recebe | Contrato | Aviso na UI |
|---|---|---|---|
| **ViaCEP** (`cep.ts:18`) | CEP (8 dígitos) + IP da visitante, **do navegador** | API pública, sem DPAA | ❌ Não |
| **Google Fonts** (`index.html:12-14`) | IP da visitante a cada página | Google ToS | ❌ Não |
| **Meta/WhatsApp** (`WhatsAppModal.tsx:26`) | Link iniciado pela usuária; texto só com produto/preço | WhatsApp ToS | ⚠️ Parcial (ela clica) |
| **Google/Gemini** | Conversa inteira (§4.1) | Cloud ToS + DPA | ❌ Não |

---

## 5. Segurança (art. 46)

### 5.1 Confirmado — está bom

* **AES-256-GCM com AAD** amarrando a cifra ao arquivo (`orders.ts:346,614-616`) — impede
  envelope transplantado de outro arquivo.
* **Chave fora do diretório de dados** em produção, com checagem de permissão 0600
  (`orders.ts:458-481`); `.data/` fora do git (`.gitignore:5`).
* **IP mascarado por padrão** (`logger.ts:35-58`, `.env.example:169`).
* **Log nunca grava PII** — regra fixa documentada (`logger.ts:66-70`); eventos citados no
  `README.md:344,350`.
* **Sem cartão salvo**, recusado na entrada (`orders.ts:155-157`).
* **XSS armazenado fechado na entrada**: nenhum campo de texto livre aceita `<`/`>`
  (`orders.ts:101-109`), porque o painel reexibe esses dados.
* **Sem escrita cross-site**, rate limit em 3 camadas na IA (`server.ts:232-253`), CSP + HSTS
  (`securityHeaders.ts:28-51`), admin atrás de chave em tempo constante + allowlist
  (`adminRoutes.ts:22-41`).
* **Separação vitrine/dados**: o site público não tem a chave nem os arquivos
  (`server.ts:30-38`, `data-server.ts:17-35`).

### 5.2 O que falta

| # | Lacuna | Art. | Esforço |
|---|---|---|---|
| S1 | **Backup de `.data/` não é tratado**: cópia leva ciphertext; em dev leva **chave junto** (`orders.ts:506-515`, aviso no próprio código). Sem procedimento de backup/restore testado, art. 46 vira promessa | 46 | Baixo |
| S2 | **Log sem rotação/política de descarte** — mascarado, mas contém nº de pedido + agregado de rede (`README.md:356`). O prazo do log é indefinido | 15, 46 | Baixo |
| S3 | **Sem 2FA/chave administrativa rotativa**; a chave é longa e estacionária | 46 | Médio |
| S4 | **Sem detecção de violação** (art. 48 exige comunicação à ANPD). Hoje há log, não há monitoramento nem playbook | 48 | Médio |
| S5 | **Sem teste de restauração** do arquivo cifrado a partir do backup | 46 | Baixo |
| S6 | Google Fonts/ViaCEP vazam IP de terceiros sem necessidade (auto-hospedar fontes resolve) | 46 | Baixo |

---

## 6. Registro das operações de tratamento (art. 37)

**Hoje:** **não existe ROPA.** Existe um bom **log operacional** — `http.request` com IP mascarado
(`logger.ts:141-147`), `admin.access` (`logger.ts:162`), `pedido.registrado` (`dataPlane.ts:120`),
e agora `pedidos.expirados_removidos` (`dataPlane.ts:183`), `pedido.anonimizado` e
`pedido.eliminado` (`adminRoutes.ts:115,130`). Isso atende o **art. 46** (segurança) e ajuda o
art. 37, mas **não substitui o registro das operações**.

**Formato mínimo proposto** — `docs/ropa.md`, uma linha por tratamento:

| Coluna | Conteúdo deste projeto |
|---|---|
| Operação | Cadastro de pré-pedido |
| Finalidade | Concluir a entrega do pedido solicitado |
| Dados | nome, telefone, endereço, itens, cupom, aceite de termos |
| Base legal | art. 7º, V (provisória) |
| Titulares | clientes que preenchem o checkout |
| Destinatários | hospedagem da loja; **Google/Gemini** (se a chave estiver ativa) |
| Transferência internacional | **sim, para os EUA, se Gemini ativo** — art. 33 |
| Retenção | 90 dias (`LOLA_ORDER_RETENTION_DAYS`) |
| Segurança | AES-256-GCM + AAD, chave fora de `.data/`, IP mascarado, admin com chave+allowlist |
| Responsável | controlador (dono da loja) · encarregado (art. 41) — **nome a definir** |

Mais 3 linhas: *logs de acesso* (retenção da rotação do SO), *assistente virtual* (consentimento,
participação do Google), *ViaCEP/Google Fonts* (interesse legítimo/minimização).
**Esforço: baixo — é um documento, não é código.**

---

## 7. Checklist de adequação, por prioridade

| # | Item | Art. | Esforço | Status |
|---|---|---|---|---|
| **P0** | | | | |
| 1 | **Publicar Política de Privacidade e Termos reais** (texto na §8.4) — hoje o modal mente (`SiteFooter.tsx:145`) | 9º, I · 6º, III | **Baixo** | ❌ decisão §8.4 |
| 2 | **Desligar `GEMINI_API_KEY` em produção** até haver aviso/consentimento | 39 · 9º | **Baixo** | ❌ decisão §8.2 |
| 3 | Definir e publicar **retenção de 90 dias** + encerrar tratamento de logs | 15, II | **Baixo** | ✅ código / ❌ logs |
| **P1** | | | | |
| 4 | Publicar **canal do titular + prazo de resposta** (15 dias, art. 19, §3º) | 18 · 19 | **Baixo** | ❌ texto pronto §8.5 |
| 5 | Declarar **encarregado (DPO)** e canal de contato | 41, §1º | **Baixo** | ❌ dado do dono |
| 6 | Escrever **ROPA** (formato na §6) | 37 | **Baixo** | ❌ |
| 7 | Escrever **LIA** do legítimo interesse (reserva de estoque, limite de cupom, logs) | 10 | **Médio** | ❌ |
| 8 | Arquivar **adhesão Google Cloud ToS + DPA** se Gemini seguir ativo | 39 | **Baixo** | ❌ |
| **P2** | | | | |
| 9 | **Correção de dados** (art. 18, IV) — rota PATCH preservando `orderNumber` | 18, IV | **Médio** | ❌ esboço §8.3 |
| 10 | Aviso/consentimento **antes de perguntar ao assistente** | 9º · 7º, I | **Médio** | ❌ decisão §8.2 |
| 11 | **Auto-hospedar fontes** e documentar ViaCEP | 46 | **Baixo** | ❌ |
| 12 | Política de **backup/restore + rotação de log** testada | 46 | **Baixo** | ❌ |
| 13 | **Playbook de incidente** (art. 48) | 48 | **Médio** | ❌ |
| **P3** | | | | |
| 14 | Exportação **self-service** do titular | 18, V | **Alto** (autenticação de titular) | ❌ decisão §8.2 |
| 15 | Migração para **banco com retenção por particionamento** quando o volume sair de 10k | 15 | **Alto** | fora de escopo hoje |

---

## 8. O que exige decisão do dono — texto pronto + pergunta exata

### 8.1 Política de eliminação: apagar ou anonimizar?
**Texto que eu usaria na política:** *"Você pode pedir a exclusão dos seus dados a qualquer
momento. Pré-pedidos que não se tornaram vendas são eliminados por completo; quando a lei ou a
gestão comercial exigir manter o registro, mantemos apenas número, data, itens e valores, sem
nome, telefone ou endereço."*

> **PERGUNTA:** Quando um titular pedir exclusão de um pré-pedido que **nunca** virou venda, a
> loja prefere **`DELETE` (elimina tudo)** ou **`redact` (apaga nome/telefone/endereço e mantém
> nº/itens/totais para auditoria)**? → **resposta esperada: `DELETE` para pré-pedido puro.**

### 8.2 Assistente virtual: enviar ao Google ou não?
**Texto para a UI do chat (pronto para colar):**
> *"Para te ajudar, suas perguntas são enviadas ao Google (Gemini), que processa dados fora do
> Brasil. Nada é guardado por nós, mas o Google atua como nosso operador. Ao continuar você
> autoriza esse envio. Prefiro responder pelo meu catálogo local, sem enviar nada."*
> — botões: **[Autorizar e perguntar]** · **[Usar sem enviar]**

> **PERGUNTAS (precisam das três):**
> 1. **O assistente vai continuar usando o Gemini em produção?** *Se não → basta manter
>    `GEMINI_API_KEY` vazia; nenhuma UI muda.*
> 2. **Se sim, você aceita o aviso + consentimento acima no primeiro uso do chat?** *Alternativa:
>    ligar o aviso uma única vez (opt-in guardado em `localStorage`) em vez de toda conversa.*
> 3. **Quem é o responsável pela conta Google e vai arquivar o DPA/Terms?**

### 8.3 Correção de dados (art. 18, IV) — esboço, não implementado
```ts
// adminRoutes.ts — preserva orderNumber/createdAt, revalida como um pedido novo
router.patch('/admin/pre-pedidos/:orderNumber', requireAdminKey, requireTrustedOrigin, (req, res) => {
  const atual = plane.orders.findByOrderNumber(req.params.orderNumber);
  if (!atual) return res.status(404).json({ error: 'Pré-pedido não encontrado.' });
  const novo = buildOrderDraft({ ...req.body, items: atual.items, termsAccepted: true },
    CATALOG_INFO, plane.inventory);
  if (!novo.ok) return res.status(novo.status).json({ error: novo.error });
  // faltaria: substituir preservando orderNumber/createdAt + evento 'pedido.corrigido'
});
```
> **PERGUNTA:** A correção entra **antes do go-live** (P2) ou fica para depois, com atendimento
> manual (excluir + recriar) até lá? *Recomendo: antes — é a diferença entre responder em 1 dia
> ou rejeitar o pedido do titular.*

### 8.4 Política de Privacidade e Termos — texto pronto (substitui o modal falso)

> **POLÍTICA DE PRIVACIDADE — Lola Aço Inox & Acessórios**
> **1. Quem trata seus dados.** [Razão social], [CNPJ], [endereço]. Encarregado (DPO):
> [nome + e-mail] (art. 41 da LGPD).
> **2. O que coletamos.** No pré-pedido: nome, telefone, CEP, logradouro, número, complemento,
> bairro, cidade, UF, itens escolhidos e forma de pagamento. No site: carrinho e favoritos ficam
> **no seu navegador** (localStorage). Não coletamos CPF, e-mail, cartão, cookies de rastreamento
> nem dados de terceiros.
> **3. Para quê (finalidade) e base legal.** Registrar e entregar seu pré-pedido — art. 7º, V;
> manter a segurança do site e limitar abuso — art. 7º, IX; cumprir obrigação legal.
> **4. Com quem compartilhamos.** Hospedagem da loja e, **se o assistente virtual estiver
> ativo**, a Google (Gemini) processa o texto das suas perguntas fora do Brasil, como nossa
> operadora (art. 39 e 33). Consulta de CEP: ViaCEP. Fornecemos endereço apenas à transportadora
> quando a venda se concretuar.
> **5. Por quanto tempo.** Pré-pedidos por **90 dias** (`LOLA_ORDER_RETENTION_DAYS`); logs pela
> rotação do servidor; dados de venda, pelo prazo legal.
> **6. Seus direitos (art. 18).** Confirmação, acesso, correção, anonimização/eliminação,
> portabilidade e informação sobre compartilhamento — peça pelo canal [WhatsApp/e-mail], com
> resposta em até **15 dias** (art. 19, §3º).
> **7. Segurança.** Seus dados são gravados cifrados (AES-256-GCM) e o acesso é restrito.
> **8. Alterações.** Publicaremos a versão vigente nesta página, com data.

> **PERGUNTAS:**
> 1. **Qual a razão social, o CNPJ e o endereço da controladora?** (obrigatório, art. 9º, I)
> 2. **Quem será o encarregado e qual e-mail publico?** (art. 41)
> 3. **Aceita publicar o bloco acima em `/privacidade` e `/termos`, com link no rodapé e link
>    no checkout (substituindo os modais atuais)?** *Esforço: baixo — ~2 rotas + 2 links.*

### 8.5 Texto do canal do titular (para o rodapé e para a política)
> *"Quer saber, corrigir ou excluir os dados que você informou no checkout? Fale com a gente
> pelo [WhatsApp/e-mail do atendimento] enviando o telefone usado na compra. Confirmamos a
> existência dos seus dados na hora e respondemos o pedido completo em até 15 dias."*

---

## 9. O que foi implementado nesta branch vs. o que ficou para decisão

### ✅ Implementado (barato, sem decisão de produto)

| Onde | O quê |
|---|---|
| `orders.ts:364-379` | Retenção padrão de **90 dias** + `resolveOrderRetentionMs` (0 = desligar, explícito) |
| `orders.ts:584-608` | **`purgeExpired`** — apaga por idade, regrava com a chave vigente, **rollback** em falha, data ilegível expira |
| `orders.ts:448,562-576` | **Índice por telefone** (`phoneIndex`), reconstruído na carga e em cada mutação |
| `orders.ts:680-736` | **`findByPhone`** (aceita `+55`, máscara e DDD 55), **`searchByName`** (sem acento/caixa), **`searchByTitular`** |
| `orders.ts:739-792` | **`remove`** (art. 18, VI) e **`redact`** (art. 18, VI parcial, com `redactedAt`) |
| `orders.ts:19-52, 54-70` | Comentários de **base legal** e de minimização em `OrderCustomer`/`StoredOrderDraft` |
| `orders.ts:294,313` | `redacted: boolean` na visão administrativa |
| `adminRoutes.ts:89-134` | Rotas **`GET /api/admin/titular`**, **`POST .../redact`**, **`DELETE .../`** — chave + allowlist + log |
| `dataPlane.ts:179-192` | Varredura de retenção na subida e de hora em hora, com evento de log |
| `server.ts:139`, `data-server.ts:93` | `LOLA_ORDER_RETENTION_DAYS` nos dois entrypoints |
| `server.ts:295-299, 350-363` | Comentários de **base legal** no checkout e na saída para o Gemini |
| `.env.example:1-13,60-69` | Documentação da retenção e do **aviso de que a chave do Gemini liga o envio a terceiro** |
| `ordersLgpd.test.ts` + `titularRoutes.test.ts` | **29 testes novos** (287 no total) |

### ❌ Ficou para decisão (texto pronto nas §8.1–8.5)

1. Publicar Política/Termos reais (§8.4) — **bloqueia o go-live** (art. 9º, I).
2. Destino do Gemini: desligar OU avisar+consentir (§8.2).
3. Política apagar × anonimizar (§8.1).
4. Correção de dados — art. 18, IV (esboço §8.3).
5. Canal + prazo de resposta ao titular (§8.5), encarregado, ROPA e LIA.
6. Tudo o que é UI: nada foi criado sem pergunta.
