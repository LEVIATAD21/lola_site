# Dívida técnica — LOLA Tech

**Papel:** `debt-lead` · **Onda:** 1 (diagnóstico) · **Território:** este arquivo

Este documento **prioriza, não executa**. Nada listado aqui é consertado nesta onda.
Quem vai consertar é a onda 2 (e as seguintes), com o território que a `MANIFEST.md`
reservar.

---

## Como ler

`impacto ÷ esforço` é o único ordenador. Escalas:

| Impacto | O que significa | Esforço | O que significa |
|---|---|---|---|
| **5** | impede a operação ou causa dano concreto (dinheiro, PII, quebra total) | **1** | minutos — troca pontual |
| **4** | a cliente sente; venda ou requisito legal em risco | **2** | horas — muda poucos arquivos |
| **3** | atrapalha quem desenvolve, testa, monitora ou opera | **3** | dias — muda muitos arquivos ou exige refatoração |
| **2** | incômodo e custo de manutenção acumulado | **4** | semanas — refatoração ampla |
| **1** | cosmético | **5** | muito grande, precisa de projeto próprio |

Desempate: impacto, depois risco de não fazer. Empates técnicos estão marcados.

---

## 1. O que **não** é dívida — classificação honesta

Confirmei os itens que me foram apontados. **Quatro** deles não são trabalho de
engenharia e não vão para o ranking fingindo que são; o quinto é uma duplicação
que eu recomendo **manter**.

| Item apontado | Classificação | Por quê | Onde está registrado |
|---|---|---|---|
| **`paymentStatus` sempre `not_configured`** (`src/server/orders.ts:56,67,260,278`) | ⛔ **Bloqueio do dono — B1** | `DECISIONS.md:16-17` diz explicitamente que não é bug e manda **não** "melhorar" isso. Escolher PSP e dar credenciais é decisão de conta e custo. | `BLOCKERS.md` B1, `docs/GO-LIVE.md` §1 |
| **Frete por tabela fixa** (`src/data/shippingOptions.ts:21-31`) | ⛔ **Bloqueio do dono — B5** | Ou integra Correios/Melhor Envio, ou aceita a tabela e manda mudar a cópia. É escolha de fornecedor/produto, não código. | `BLOCKERS.md` B5 |
| **Correção de dados, art. 18, IV** | ⛔ **Requisito legal pendente do dono — B8** | `DECISIONS.md:43` manda não fingir que existe. Não foi construído, e o escopo ("corrigir" o quê num pré-pedido cifrado e sob retenção de 90 dias?) precisa de decisão antes de virar ticket. Se o dono disser sim, entra como **requisito de compliance**, com prioridade alta — não como item de limpeza. | `BLOCKERS.md` B8 |
| **Catálogo vem de `mockData.ts`** | ⚠️ **Decisão de produto pendente — B7** | O *sim/não* ("a vitrine passa a chamar `GET /api/produtos` ou o catálogo fica embutido no bundle?") é da dona da loja. O que é engenharia e já dá pra fazer **independente da resposta** está em **D15** — o contrato não fecha. | `BLOCKERS.md` B7 |
| **Duplicação vitrine × servidor na validação de endereço** (`src/utils/checkoutValidation.ts` × `buildOrderDraft`) | ✅ **Duplicação aceitável — manter** | UX na vitrine, autoridade no servidor. Só seria dívida se a vitrine *substituísse* a validação do servidor; ela não substitui. | — |

**Um efeito colateral de B1** que vale registrar para quem integrar o gateway:
o acoplamento é em **três** pontos que precisam mudar **juntos** —
`src/server/orders.ts:260` (grava `not_configured`),
`src/services/api.ts:176` e `:187` (`parseDraftOrderConfirmation` **recusa** o
pedido se `paymentStatus` não for `not_configured`) e a UI
(`src/components/checkout/OrderSuccessModal.tsx:43`). Não é dívida de hoje; é
uma armadilha para o dia do PSP. Anotar na PR do gateway.

---

## 2. Verificação do que me foi pedido

| Apontamento | Confirmado? | Evidência |
|---|---|---|
| Catálogo vem de `mockData.ts`; `GET /api/produtos` existe e ninguém chama | **Sim** | **21 arquivos da vitrine** importam de `src/data/mockData.ts` (`src/App.tsx:20`, `src/components/checkout/CheckoutPage.tsx:10`, `src/components/CategorySection.tsx:3` …). A rota está em `server.ts:308-332`. `src/services/api.ts` **não tem função de listagem** — só estoque, IA e rascunho de pedido. Ver **D3** e **D15**. |
| 12 modais sem focus trap nem Escape | **Sim** | 12 componentes com `role="dialog"`. **0** com focus trap, **0** com trava de rolagem, **1** com Escape (`src/components/product/ProductLightboxModal.tsx:24`), **0** com `createPortal`, **1** sem `aria-modal` (`ChatbotAssistente`). Ver **D8**. |
| Correção de dados (art. 18, IV) não existe | **Sim** | Só exclusão/anonimização (`src/server/orders.ts:751,785`). Classificado acima como B8. |
| Frete por tabela fixa | **Sim** | `src/data/shippingOptions.ts:21-31` — e a mesma tabela está **reescrita** em `src/server/orders.ts:241-246`. Ver **D7**. |
| `paymentStatus` sempre `not_configured` | **Sim** | B1, não é dívida. |
| Resíduos da remoção do `ReportModal` | **Sim, mas só em documentação** | Em `src/` **não sobrou nada** (commit `daecdd2` foi limpo). Sobrou em docs — ver **D5**. |

---

## 3. Ranking completo

| # | ID | Dívida | Evidência (`arquivo:linha`) | I | E | **I÷E** | Dono natural |
|---|---|---|---|---|---|---|---|
| 1 | **D2** | `ProductDetailModal` é código morto — nunca abre | `src/App.tsx:87,88,637-644` | 3 | 1 | **3,00** | `fe-perf` |
| 2 | **D1** | Cupom: a vitrine ignora `minSubtotalCents` e `validUntil` que o servidor cobra | `src/data/coupons.ts:88-103` × `:53-82` | 4 | 2 | **2,00** | `fe-catalog` |
| 3 | **D3** | Busca do cabeçalho varre 5 de 25 produtos; o endpoint de busca completa existe e ninguém chama | `src/components/SiteHeader.tsx:57-64` × `server.ts:308-332` | 4 | 2 | **2,00** | `fe-catalog` |
| 4 | **D4** | Barra de filtros exibe contagens **inventadas** quando o total real é 0 | `src/components/category/FilterSidebar.tsx:71-104` | 2 | 1 | **2,00** | `fe-catalog` |
| 5 | **D6** | Preço formatado 33× com `toFixed(2).replace('.',',')` — sem separador de milhar, zero `Intl.NumberFormat` | 19 arquivos, ex. `src/components/checkout/CheckoutOrderSummary.tsx:106,134,179` | 2 | 1 | **2,00** | `fe-i18n` |
| 6 | **D5** | Comentários e docs apontando para `REPORT.md` e para linhas que não existem mais | `server.ts:357`, `README.md:357`, `docs/auditorias/lgpd.md:9`, `docs/auditorias/frontend.md:24,132,142-150,213` | 2 | 1 | **2,00** | `doc-changelog` |
| 7 | **D9** | 18 chamadas `console.*` em 6 arquivos do backend, fora do logger estruturado | `src/server/orders.ts` (9), `trustedProxy.ts` (3), `ipAllow.ts` (3), `internalAuth.ts:163`, `internalClient.ts:151`, `server.ts:497` | 3 | 2 | **1,50** | `be-obs` |
| 8 | **D10** | 3 testes dependentes de tempo real | `src/server/__tests__/logger.test.ts:9`, `rateLimit.test.ts:176`, `httpDataPlaneRede.test.ts:112` | 3 | 2 | **1,50** | `qa-flaky` |
| 9 | **D11** | Mapeamento rota→view implementado **três vezes** no mesmo arquivo | `src/App.tsx:34-45`, `:140-172`, `:185-204` | 3 | 2 | **1,50** | `fe-perf` (arquivo) / `fe-nav` (natural) |
| 10 | **D8** | 12 modais sem focus trap, sem Escape, sem trava de rolagem, sem retorno de foco | 12 arquivos com `role="dialog"` — ver ficha | 4 | 3 | **1,33** | `fe-a11y` |
| 11 | **D7** | Frete e embalagem **reescritos** em 7 pontos vitrine × servidor | `src/data/shippingOptions.ts:21-31`, `src/server/orders.ts:241-248`, `src/components/checkout/CheckoutPage.tsx:90-91`, `src/components/CartDrawer.tsx:29`, `CheckoutOrderSummary.tsx:39,156,269` | 3 | 3 | 1,00 | `fe-catalog` + `be-idem` |
| 12 | **D15** | Contrato de `/api/produtos` não serve a vitrine (`desc` × `description`; faltam `earringType`, `isNewArrival`) | `src/server/catalog.ts:15-26` × `src/data/mockData.ts:1-15` | 3 | 3 | 1,00 | `api-eng` (contrato) + `fe-catalog` |
| 13 | **D12** | Boot do `server.ts` e do `data-server.ts` duplicado, com **defaults divergentes** | `server.ts:127-143` × `data-server.ts:80-96`; `server.ts:155` × `data-server.ts:145` | 3 | 3 | 1,00 | `be-config` + `arch-chief` |
| 14 | **D16** | Não existe linter: `npm run lint` = `tsc --noEmit`; CI chama o passo de "Typecheck" | `.github/workflows/ci.yml:26-27`, `package.json:18` | 2 | 2 | 1,00 | `devops-ci` |
| 15 | **D17** | `WhatsAppModal` recebe um `Product` sintético com categoria e tamanho fixos | `src/components/checkout/CheckoutPage.tsx:473-483`, `src/components/cart/CartPage.tsx:293-305`, `src/components/product/WhatsAppModal.tsx:14-24` | 2 | 2 | 1,00 | `fe-components` |
| 16 | **D13** | `tsconfig.json` sem `strict`; 7 `any` explícitos | `tsconfig.json` (0 ocorrências de `strict`); `CheckoutPage.tsx:29`, `CheckoutAddressForm.tsx:47`, `CheckoutPaymentMethod.tsx:32`, `src/services/api.ts:116`, `src/utils/cartStorage.ts:110-112` | 3 | 4 | 0,75 | `arch-sw` + `devops-ci` |
| 17 | **D14** | Funções muito longas | `server.ts:97-606` (~510 linhas), `server.ts:360-540` (~180), `src/server/orders.ts:123-272` (~150), `src/App.tsx:29-686` (17 `useState`, 7 `useEffect`) | 3 | 4 | 0,75 | `lead-be` / `lead-fe` |
| 18 | **D18** | `package.json` com nome de template e script morto | `package.json:2` (`"react-example"`), `:17` (`clean` apaga `server.js`, que nunca é gerado) | 1 | 1 | 1,00 | `devops-ci` |
| 19 | **D19** | `setTimeout` sem cleanup no unmount | `src/App.tsx:216,449`, `src/components/ProductDetailModal.tsx:51` | 1 | 1 | 1,00 | `fe-states` |
| 20 | **D20** | Prop morta com `any` implícito | `src/components/checkout/CheckoutPage.tsx:29` (`onOrderCompleted`, nunca passada) | 1 | 1 | 1,00 | `fe-forms` |

---

## 4. Os 10 primeiros — ficha detalhada

### #1 · D2 — `ProductDetailModal` é código morto · **I÷E = 3,00**

- **O quê.** `src/App.tsx:87` declara `selectedProductForModal` e **nunca chama
  `setSelectedProductForModal`**; `src/App.tsx:88` declara `isProductModalOpen`
  e **nunca recebe `true`** (só `false` no `onClose` de `src/App.tsx:640`).
  O modal renderizado em `src/App.tsx:637-644` é **inalcançável**. As 208 linhas
  de `src/components/ProductDetailModal.tsx` entram no bundle.
- **Impacto 3.** É exatamente o defeito que o commit `daecdd2` removeu no
  `ReportModal`; sobrou o mesmo padrão no componente vizinho. Custo de bundle
  (menor) e, pior, **custo de engano**: alguém vai "consertar" um modal que
  nenhuma cliente nunca viu, ou vai copiar o padrão.
- **Esforço 1.** Apagar 2 estados, 1 bloco de JSX e um arquivo. Mesma prova do
  `ReportModal`: sem mudança de comportamento.
- **Risco de não fazer.** Próxima auditoria repete a ACH-07 com outro nome; o
  bundle continua carregando painel inalcançável; o padrão "estado que só
  recebe `false`" vira norma na casa.
- **Dono natural:** `fe-perf` (já é dono de `src/App.tsx` na onda 2).
- **Onda:** **2**, junto com D11 — mesma ida ao mesmo arquivo.

### #2 · D1 — Cupom: a vitrine concede o que o servidor recusa · **I÷E = 2,00**

- **O quê.** `COUPON_RULES` (`src/data/coupons.ts:21-23`) define
  `validUntil: '2026-12-31'` e, para `BEMVINDA`,
  `minSubtotalCents: 15_000`. A autoridade `checkCoupon`
  (`src/data/coupons.ts:53-82`) cobra as duas. Mas a vitrine calcula o desconto
  com `getCouponPercentage` (`src/data/coupons.ts:88-103`), que **só confere se
  o código existe** — `getCouponDiscount` (`:104`) aplica o percentual em
  qualquer subtotal.
- **Impacto 4.** Consequências concretas:
  - Sacola com `BEMVINDA` abaixo de R$ 150 mostra **-15% na tela**; no passo
    final `checkCoupon` nega e `buildOrderDraft` devolve **400**
    (`src/server/orders.ts:230-236`) — o pedido **não registra**. A cliente só
    vê o motivo no fim do checkout.
  - **No fim de 31/12/2026 os três cupons expiram** (`validUntil: '2026-12-31'`,
    comparado em UTC em `src/data/coupons.ts:69`) e a vitrine continua
    descontando — aí *todo* cupom passa a morrer no passo final, ao mesmo tempo.
- **Esforço 2.** A regra já está no mesmo arquivo; é reaproveitar
  `checkCoupon` em `getCouponPercentage`/`getCouponDiscount` e passar o subtotal
  aos 2 pontos que não o têm (`src/components/cart/CouponModal.tsx:34`,
  `src/utils/checkoutStorage.ts:50`).
- **Risco de não fazer.** Checkout trava no último clique com total exibido
  diferente do total aceito — é a definição de "a vitrine mentiu preço", que já
  custou uma correção de rodapé nesta casa.
- **Dono natural:** `fe-catalog` (tabela e cálculo vivem em `src/data/coupons.ts`,
  que é também onde o servidor lê). Contraparte `be-idem` (`src/server/orders.ts`).
- **Onda:** **2**.

### #3 · D3 — Busca do cabeçalho varre 5 de 25 produtos · **I÷E = 2,00**

- **O quê.** `src/components/SiteHeader.tsx:57-64` filtra
  **`FEATURED_PRODUCTS`** — são **5** peças (`src/data/mockData.ts:323`).
  O catálogo tem **25** (`EARRINGS_CATALOG` 20 + 5 destaque).
  Ao mesmo tempo, `GET /api/produtos?query=` (`server.ts:308-332`) busca em
  **todos** os campos do catálogo completo — e **nenhum componente o chama**.
- **Impacto 4.** Caixa de busca que não acha o produto que a cliente digitou é
  perda de venda direta e é o único lugar da home onde a falha é gritante.
  De quebra, a rota de busca fica sem consumidor: ninguém valida o contrato.
- **Esforço 2.** Trocar `FEATURED_PRODUCTS` por `ALL_PRODUCTS` resolve o sintoma
  no mesmo dia; ligar no endpoint resolve o sintoma **e** começa a consumir a API.
- **Risco de não fazer.** Cliente digita "argola", vê 0 resultados, fecha a aba.
  E a rota de busca continua sendo código não exercitado por ninguém.
- **Dono natural:** `fe-catalog`.
- **Onda:** **2**. Se o dono responder B7 com "sim, usa a API", D3 vira a
  primeira consumidora — e aí D15 passa a ser pré-requisito.

### #4 · D4 — Barra de filtros mostra contagens inventadas · **I÷E = 2,00**

- **O quê.** `src/components/category/FilterSidebar.tsx:71-104` —
  `count: counts.types['Argolas'] || 12`, `counts.priceRanges['under-30'] || 12`,
  `counts.colors['Prateado'] || 8`, `counts.materials['Aço inox'] || 48` …
  O `||` só aparece quando o total real é **0** (ou não calculado): aí a barra
  anuncia **12 peças** onde há **nenhuma**.
- **Impacto 2.** Só dispara quando a contagem real é zero, mas quando dispara é
  uma **afirmação falsa na vitrine** — o mesmo tipo de coisa que já corrigiu o
  rodapé (commit `f24dcbc`) e o copy do chat.
- **Esforço 1.** Remover os literais; exibir 0 ou ocultar a opção.
- **Risco de não fazer.** Cliente aplica filtro, resultado vazio, sensação de
  loja quebrada; e o padrão "número decorativo" contagia as próximas telas.
- **Dono natural:** `fe-catalog`.
- **Onda:** **2**.

### #5 · D6 — Preço formatado 33 vezes, sem separador de milhar · **I÷E = 2,00**

- **O quê.** `.toFixed(2).replace('.', ',')` aparece **33 vezes em 19 arquivos**
  (ex.: `src/components/checkout/CheckoutOrderSummary.tsx:106,134,148,163,179`).
  `Intl.NumberFormat` e `toLocaleString` aparecem **0** vezes.
- **Impacto 2.** Todo subtotal ≥ R$ 1.000 sai como `R$ 1234,50` — sem ponto de
  milhar. Soma de itens no checkout chega lá com facilidade.
- **Esforço 1.** Um `formatBRL(cents)` em módulo único + troca mecânica.
- **Risco de não fazer.** Cada tela nova copia a expressão (já são 19 cópias);
  um dia alguém copia errado e o preço sai com casas decimais trocadas.
- **Dono natural:** `fe-i18n`.
- **Onda:** **3** (nenhum papel da onda 2 tem território nos componentes).

### #6 · D5 — Comentários e docs apontando para o que já não existe · **I÷E = 2,00**

- **O quê.** É **todo o resíduo da remoção do `ReportModal`** — em código não
  sobrou nada, em documentação sobrou bastante:
  - `server.ts:357` — "consentimento **(ver REPORT.md)**": o arquivo não existe
    (virou `docs/auditorias/lgpd.md`);
  - `README.md:357` — "Detalhes e matriz de direitos do titular: **`REPORT.md`**";
  - `docs/auditorias/lgpd.md:9` — "vem de **`REPORT.md`** como proposta";
  - `docs/auditorias/frontend.md:24,142-150,213` — ACH-07 ainda pergunta ao
    produto se o `ReportModal` deve ou não sair do bundle, **quando já saiu**;
  - `docs/auditorias/frontend.md:132` — lista "os 12 modais" incluindo
    `ReportModal` e **esquecendo `ProductLightboxModal`** (a lista atual de 12
    está na ficha de D8);
  - `docs/auditorias/frontend.md:144` — cita `src/App.tsx:122` e
    `src/App.tsx:709-716`; o arquivo tem **686** linhas;
  - `server.ts:84` — comentário "Catálogo resumido para contexto do assistente"
    acima de `STORE_FAQS`, que é texto de política, não catálogo;
  - `BLOCKERS.md` e `docs/GO-LIVE.md:70` citam `server.ts:449` para o envio ao
    Gemini; a chamada está em `server.ts:445-454`.
- **Impacto 2.** Quem entra na onda 2 lê esses docs e segue linha errada — custo
  repassado a dez pessoas, não a uma.
- **Esforço 1.** Busca e troca textual, com o autor original revisando.
- **Risco de não fazer.** Alguém "restaura" o painel por achar que era pendência;
  a próxima auditoria gasta meia hora achando `App.tsx:709`.
- **Dono natural:** `doc-changelog` (README + comentários de código) — e
  `docs/auditorias/frontend.md` precisa do **autor original**, que não tem
  território na onda atual.
- **Onda:** **3**, ou agora se o autor do `frontend.md` ainda estiver na onda 1.

### #7 · D9 — `console.*` fora do logger estruturado · **I÷E = 1,50**

- **O quê.** Existem **18** chamadas `console.*` em **6** arquivos de backend,
  fora do `src/server/logger.ts` que é justamente o módulo que impõe formato,
  nível e **IP mascarado**:
  `src/server/orders.ts` (9 — linhas 508, 515, 550, 605, 630, 642, 650, 751, 785),
  `src/server/trustedProxy.ts` (3 — 48, 60, 68), `src/server/ipAllow.ts` (3 —
  74, 103, 108), `src/server/internalAuth.ts:163`,
  `src/server/internalClient.ts:151`, `server.ts:497`.
- **Impacto 3.** Log sem nível, sem campo estruturado, sem passar pela
  máscara de IP: é o oposto do que `DECISIONS.md:25` estabelece e é o que o
  `be-obs` vai herdar como "duas formas de registrar coisa na mesma casa".
- **Esforço 2.** Trocar chamada por `log()` com o mesmo motivo/ação.
- **Risco de não fazer.** Em incidente, metade dos eventos não entra no formato
  que o monitor procura; e um dia um `console.error(err)` vaza objeto de erro
  com cabeçalho — a falha que `server.ts:494-497` já documentou e contornou só
  naquele ponto.
- **Dono natural:** `be-obs`.
- **Onda:** **2**, **mas com território liberado pelo integrador** — os 18 call
  sites estão fora de `src/server/logger.ts`, que é o único arquivo reservado ao
  papel.

### #8 · D10 — Testes dependentes de tempo real · **I÷E = 1,50**

- **O quê.**
  - `src/server/__tests__/logger.test.ts:9` —
    `settle = () => new Promise(r => setTimeout(r, 50))`: espera 50 ms e reza
    para o log ter sido escrito. Máquina lenta = vermelho falso.
  - `src/server/__tests__/rateLimit.test.ts:176` —
    `await new Promise(r => setTimeout(r, 1_100))`: **1,1 s de sono real** por
    execução para a janela de 1 s vencer.
  - `src/server/__tests__/httpDataPlaneRede.test.ts:112` —
    `setTimeout(() => res.destroy(), 10)`: corrida de 10 ms entre gravar o corpo
    parcial e destruir o socket.
- **Impacto 3.** O `PROTOCOLO.md:17-19` faz do `vitest` o **portão de
  integração** — é o integrador que roda a suíte inteira para decidir se pode
  mesclar. Um teste que depende de relógio degrada exatamente esse portão, e
  degrada para os dois lados: vermelho falso quebra a confiança, verde falso
  esconde regressão.
- **Esforço 2.** `vi.useFakeTimers({ toFake: ['Date'] })` já é usado em
  `rateLimitRelogio.test.ts` e `httpDataPlane.test.ts` — o padrão existe na
  casa, só falta aplicar nesses três.
- **Risco de não fazer.** "Às vezes falha" vira hábito; alguém marca `it.skip`
  e o portão abre.
- **Dono natural:** `qa-flaky`.
- **Onda:** **3** (na onda 2, `qa-mutation` só cobre `src/**/__tests__/mutation/*`).

### #9 · D11 — Rota→view implementada três vezes no mesmo arquivo · **I÷E = 1,50**

- **O quê.** `src/App.tsx` resolve caminho→tela em três blocos independentes:
  `getInitialView` (`:34-45`), o efeito de `pushState` (`:140-172`) e o handler
  de `popstate` (`:185-204`). Cada bloco tem sua própria `if/else` de
  `/categoria/brincos`, `/produto/:id`, `/carrinho`, `/checkout`.
- **Impacto 3.** Não há roteador: três regras que precisam ser editadas em
  conjunto. Esquecer uma delas quebra deep link, botão voltar ou título da aba —
  silenciosamente, sem erro de compilação.
- **Esforço 2.** Extrair `resolveRoute(path)` puro + testá-lo uma vez.
- **Risco de não fazer.** A onda de SEO (`seo-eng`) vai mexer em rota e não vai
  saber que há três lugares para sincronizar.
- **Dono natural:** `fe-perf` (dono de `src/App.tsx` na onda 2), com `fe-nav`
  como revisor natural depois.
- **Onda:** **2**, na mesma ida de D2.

### #10 · D8 — 12 modais sem focus trap, Escape, trava de rolagem ou retorno de foco · **I÷E = 1,33**

- **O quê.** Os 12 componentes com `role="dialog"`:

  | Arquivo | Linhas | Escape | Focus trap |
  |---|---|---|---|
  | `src/components/ChatbotAssistente.tsx` | 325 | ✗ (e sem `aria-modal`) | ✗ |
  | `src/components/CartDrawer.tsx` | 219 | ✗ | ✗ |
  | `src/components/ProductDetailModal.tsx` | 208 | ✗ | ✗ |
  | `src/components/cart/ShippingCalculatorModal.tsx` | 185 | ✗ | ✗ |
  | `src/components/FavoritesModal.tsx` | 147 | ✗ | ✗ |
  | `src/components/cart/CouponModal.tsx` | 123 | ✗ | ✗ |
  | `src/components/product/ProductLightboxModal.tsx` | 120 | ✓ (`:24`) | ✗ |
  | `src/components/InfoModal.tsx` | 112 | ✗ | ✗ |
  | `src/components/product/WhatsAppModal.tsx` | 105 | ✗ | ✗ |
  | `src/components/category/MobileFilterDrawer.tsx` | 88 | ✗ | ✗ |
  | `src/components/checkout/OrderSuccessModal.tsx` | 77 | ✗ | ✗ |
  | `src/components/cart/ClearCartModal.tsx` | 71 | ✗ | ✗ |

  Além disso: **0** usam `createPortal` e **nenhum** trava a rolagem do fundo
  (`document.body.style.overflow` não aparece em `src/`). O bloco
  `fixed inset-0 bg-black/60 backdrop-blur` está **copiado em 10 arquivos**.
- **Impacto 4.** WCAG 2.1 AA: 2.1.1 (teclado), 2.1.2 (sem armadilha de foco),
  1.4.10 (reflow). Quem navega por teclado entra num modal e **não sai**;
  o foco continua no botão do fundo atrás da sobreposição. Não é luxo: é
  requisito de acessibilidade e a auditoria correspondente é da `a11y-eng`.
- **Esforço 3.** Um `useDialogA11y` (focus trap + Escape + trava de rolagem +
  retorno de foco) aplicado a 12 pontos + testes. O território
  `src/hooks/useDialogA11y.ts` já está reservado para `fe-a11y`.
- **Risco de não fazer.** Loja inacessível por teclado, com a auditoria da
  onda 1 apontando exatamente isso e ninguém consertando.
- **Dono natural:** `fe-a11y`, **com a `a11y-eng` definindo o quê corrigir**
  (a ordem entre os 12 vem de `docs/A11Y.md`, ainda em produção na onda 1).
  ⚠️ Se **D2** entrar primeiro, `ProductDetailModal` sai da lista e sobram
  **11** — fazer na mesma onda, na mesma ordem, para não consertar um modal que
  vai ser apagado.
- **Onda:** **2**. ⚠️ Este é o item de menor razão do top 10 (1,33) e o único
  cuja ordem interna **não é minha para definir**: se `a11y-eng` classificar
  qualquer um dos 12 como travessa em `docs/A11Y.md`, ele sobe para o topo da
  fila da onda 2.

---

## 5. Resto da fila (não entra no top 10)

- **D7 (1,00) — frete e embalagem reescritos em 7 pontos.** A tabela de frete
  existe em `src/data/shippingOptions.ts:21-31` **e** em
  `src/server/orders.ts:241-246` (19,90/28,90/22,50 × 1990/2890/2250 centavos);
  o limiar de frete grátis de R$ 150 aparece em 3 lugares
  (`shippingOptions.ts:22`, `orders.ts:241`, `src/components/CartDrawer.tsx:29`);
  a embalagem de R$ 9,90 aparece em 4
  (`CheckoutPage.tsx:91`, `CheckoutOrderSummary.tsx:39,156,269`,
  `orders.ts:248`). **Hoje os números coincidem** — por isso impacto 3 e não 4:
  é drift latente, não bug vivo. Mas `DECISIONS.md:14-15` ("tudo que é dinheiro
  nasce no servidor") está sendo mantido por acidente, não por construção.
  Dono `fe-catalog` + `be-idem`.
- **D15 (1,00) — contrato da API não serve a vitrine.** `CATALOG_INFO`
  (`src/server/catalog.ts:15-26`) expõe `desc`; a vitrine lê `description`.
  `earringType` (usado em `src/components/category/EarringsCategoryPage.tsx:64,91`)
  e `isNewArrival` (`:131`) **não existem na API** — os filtros de tipo de brinco
  e a ordenação "novidades" **quebrariam** se D3 passasse a consumir o endpoint.
  `isFeatured` e `originalPrice` (`src/data/mockData.ts:6,9`) são declarados e
  **nunca lidos** por ninguém. Dono `api-eng` registra em `docs/API.md`;
  `fe-catalog` implementa. É **pré-requisito de B7**, não substituto dele.
- **D12 (1,00) — boot duplicado com defaults divergentes.**
  `server.ts:127-143` × `data-server.ts:80-96` montam o mesmo
  `createLocalDataPlane`, e o teto `maxHoldsPerOrigin` é **10 de um lado e 0 do
  outro** (correto e documentado, mas escrito duas vezes — nada impede que
  divergam de novo). A conferência da chave admin (`ADMIN_KEY_MIN_LENGTH = 32`)
  está escrita em `server.ts:155` **e** `data-server.ts:145`, sem constante
  compartilhada. O comentário de `server.ts:50-55` está **repetido literalmente**
  em `server.ts:148-151`. `/api/health`, o middleware `no-store`, o 404 e o
  handler de erro estão nos dois. Dono `be-config`, com `arch-chief` aprovando
  (muda arquitetura, não só código).
- **D16 (1,00) — não existe linter.** `package.json:18` define
  `lint: tsc --noEmit`, e `.github/workflows/ci.yml:26-27` chama um passo
  chamado **"Typecheck"** que roda `npm run lint`. Não há ESLint no projeto
  (0 ocorrências em `package.json`, nenhum `.eslintrc`/`eslint.config.*`).
  Resultado: `strict` off (D13), `any` aceito, dependências de `useEffect`
  não conferidas por ninguém. Dono `devops-ci`.
- **D17 (1,00) — `Product` sintético para falar de WhatsApp.**
  `CheckoutPage.tsx:473-483` monta `{ id: 'checkout-summary', category: 'Brincos',
  price: totalAmount, ... }` e `CartPage.tsx:293-305` faz o mesmo com
  `{ id: 'cart-summary', ... }` — categoria fixa em "Brincos" mesmo com colares
  na sacola, e `WhatsAppModal.tsx:14` aplica `selectedSize = 'P (1,5 cm)'` a
  qualquer resumo, então a mensagem sai com tamanho de brinco para um pedido de
  3 itens. `WhatsAppModal.tsx:23` ainda tem preço-coringa `'R$ 49,90'`.
  Dono `fe-components`.
- **D13 (0,75) — `tsconfig.json` sem `strict`.** Nenhuma ocorrência de `strict`
  no arquivo. 7 `any` explícitos fora de teste: `CheckoutPage.tsx:29`,
  `CheckoutAddressForm.tsx:47`, `CheckoutPaymentMethod.tsx:32`,
  `src/services/api.ts:116`, `cartStorage.ts:110-112`. Esforço 4 porque é
  ligar `strict` em 18 mil linhas já existentes. Dono `arch-sw`, com
  `devops-ci` travando na CI depois.
- **D14 (0,75) — funções longas.** `startServer` ~510 linhas (`server.ts:97-606`),
  handler da IA ~180 (`server.ts:360-540`), `buildOrderDraft` ~150
  (`src/server/orders.ts:123-272`), componente `App` 686 linhas com 17 `useState`
  e 7 `useEffect`. Custo de leitura e de conflito entre ondas — cada uma dessas
  funções é um arquivo que dez papéis querem mexer ao mesmo tempo.
  Dono `lead-be` / `lead-fe`.
- **D18/D19/D20 (1,00) — limpeza miúda.** `package.json:2` ainda se chama
  `"react-example"` e o script `clean` (`:17`) apaga `server.js`, que nunca é
  gerado (`noEmit: true`); `setTimeout` sem cleanup em `src/App.tsx:216,449`;
  `onOrderCompleted?: (orderData: any)` em `CheckoutPage.tsx:29` é prop opcional
  que `src/App.tsx` nunca passa. Donos `devops-ci`, `fe-states`, `fe-forms`.

---

## 6. As 10 primeiras — e em qual onda entra cada uma

| Pos | ID | Dívida | I÷E | Dono natural | **Onda** | Observação de território |
|---|---|---|---|---|---|---|
| 1 | D2 | `ProductDetailModal` morto | 3,00 | `fe-perf` | **2** | Já é dono de `src/App.tsx` |
| 2 | D1 | Cupom com regra que o servidor recusa | 2,00 | `fe-catalog` | **2** | `src/data/coupons.ts` fora da lista literal de territórios — **pedir ao integrador** |
| 3 | D3 | Busca varre 5 de 25 produtos | 2,00 | `fe-catalog` | **2** | `src/components/SiteHeader.tsx` — **pedir ao integrador** |
| 4 | D4 | Contagens inventadas no filtro | 2,00 | `fe-catalog` | **2** | `src/components/category/FilterSidebar.tsx` — **pedir ao integrador** |
| 5 | D6 | Preço sem separador de milhar (33×) | 2,00 | `fe-i18n` | **3** | Nenhum papel da onda 2 cobre os componentes |
| 6 | D5 | Docs/comentários para `REPORT.md` e linhas mortas | 2,00 | `doc-changelog` (+ autor de `frontend.md`) | **3** | `README.md` e `server.ts` sem dono em nenhuma onda — **pedir ao integrador** |
| 7 | D9 | 18 `console.*` fora do logger | 1,50 | `be-obs` | **2** | Call sites fora de `src/server/logger.ts` — **pedir ao integrador** |
| 8 | D10 | 3 testes dependentes de timing | 1,50 | `qa-flaky` | **3** | `qa-mutation` (onda 2) só cobre `mutation/*` |
| 9 | D11 | Rota→view escrita 3× em `App.tsx` | 1,50 | `fe-perf` (rev. `fe-nav`) | **2** | Mesma ida de D2 — fazer junto |
| 10 | D8 | 12 modais sem focus trap/Escape | 1,33 | `fe-a11y` (criterio: `a11y-eng`) | **2** | Território já reservado: `src/hooks/useDialogA11y.ts` + 12 modais |

**Resumo por onda:** onda 2 leva **7** (D2, D1, D3, D4, D9, D11, D8) —
é onde estão os donos e onde o custo de contexto é menor. Onda 3 leva **3**
(D6, D5, D10), cujos papéis (`fe-i18n`, `doc-changelog`, `qa-flaky`) ainda
estão na fila.

**Primeira reserva da fila (11º):** **D7**, frete e embalagem duplicados —
`fe-catalog` + `be-idem`, onda 2/3, razão 1,00. É o item que mais se parece com
"limpeza" e é o que mais se parece com a regra de arquitetura que a casa mais
valoriza (`DECISIONS.md:14-15`); se algum desses papéis terminar cedo, é para
lá que eu mandaria.

---

## 7. O que precisa de outra pessoa

1. **Integrador** — **liberação de território** para D1, D3, D4 (arquivos de
   componentes e `src/data/coupons.ts` fora da lista literal da onda 2), D9
   (18 call sites fora de `src/server/logger.ts`) e D5 (`README.md` e
   `server.ts` sem dono em nenhuma onda). Sem isso, cinco dos dez primeiros
   ficam sem dono com território limpo.
2. **`a11y-eng`** — a ordem de correção dos 12 modais e a classificação de
   travessa (D8, pos. 10, depende do `docs/A11Y.md`, que ainda está sendo
   escrito).
3. **Autor de `docs/auditorias/frontend.md`** — a ACH-07 está desatualizada e
   pede uma decisão ao produto que **já foi tomada e executada** (D5, pos. 6).
4. **`api-eng`** — registrar em `docs/API.md` que o contrato de
   `/api/produtos` não serve a vitrine hoje (D15). Se isso não entrar no
   contrato da onda 1, `fe-catalog` vai descobrir tarde.
5. **Dona da loja** — B1 (gateway), B5 (frete real), B7 (sim/não do catálogo),
   B8 (art. 18, IV). **Nenhum dos quatro é dívida de engenharia** e nenhum dos
   quatro deve entrar na fila de remediação como se fosse.
