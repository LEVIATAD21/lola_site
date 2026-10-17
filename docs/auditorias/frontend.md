# Auditoria de Segurança — Frontend (`lola_site`)

- **Escopo:** `src/components/`, `src/data/`, `src/utils/`, `src/App.tsx`, `src/services/`, `index.html`, `vite.config.ts`, `main.tsx`.
- **Data:** 2026-10-13.
- **Base:** branch `agente/frontend`, trabalho adversarial sobre o front-end, que até então não tinha sido auditado de forma independente.
- **Foco pedido:** XSS por dados do servidor, `localStorage` como fonte de verdade, open redirect, links externos, segredos no bundle, `document.title`/meta e acessibilidade crítica.

---

## Sumário executivo

**Nenhum achado Crítico ou Alto.** O front-end não expõe vetores clássicos de XSS (nenhum `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, `document.write` ou `insertAdjacentHTML` em todo `src/`), nenhum segredo com prefixo `VITE_` está embutido no bundle e não há open redirect.

O problema sistemático encontrado é outro: **o `localStorage` era tratado como fonte de verdade em pontos que exibem dinheiro**. O backend já havia sido corrigido para recalcular preço, estoque e desconto, mas o front-end ainda exibia valores vindos direto do navegador — e, em um caso, permitia que um percentual de cupom inventado fosse usado em conta de subtotal.

| ID | Severidade | Título | Status |
|----|-----------|--------|--------|
| ACH-01 | **Médio** | Percentual de cupom do `localStorage` usado como autoridade no desconto | ✅ Corrigido |
| ACH-02 | Baixo | Frete do `localStorage` aceitava nome/prazo/preço arbitrários | ✅ Corrigido |
| ACH-03 | Baixo | Favoritos do `localStorage` sem validação de tipo ou limite | ✅ Corrigido |
| ACH-04 | Baixo | Item do carrinho: texto e `image` sem limite de tamanho nem restrição de origem | ✅ Corrigido |
| ACH-05 | Informativo | Lookup de cupom pela cadeia de protótipo (`VALID_COUPONS[...]`) | ✅ Corrigido (hardening) |
| ACH-06 | Informativo | Modais sem focus trap e sem fechamento por `Escape` | 📄 Documentado |
| ACH-07 | Informativo | `ReportModal` é código morto no bundle e documenta endpoints internos | ✅ Removido (commit `daecdd2`) |

---

## ACH-01 — Médio — Percentual de cupom do `localStorage` usado como autoridade no desconto

**Arquivos:**
- `src/App.tsx:83-95` (antes da correção) — leitura de `lola_coupon`.
- `src/components/cart/CartPage.tsx:56` (antes da correção) — `const discountAmount = coupon ? (subtotal * coupon.percentage) / 100 : 0;`

**O que acontecia.** A leitura de `lola_coupon` validava apenas `typeof parsed.code === 'string' && typeof parsed.percentage === 'number' && parsed.percentage > 0`. Não havia teto nem conferência com a tabela oficial. A sacola então usava **esse percentual** na conta do desconto. O checkout, por outro lado, já usava `getCouponDiscount(coupon?.code, subtotal)`, que recalcula pela tabela — ou seja, **sacola e checkout discordavam** para o mesmo estado.

**PoC concreta:**

```js
// no console do navegador, em qualquer página da loja
localStorage.setItem('lola_coupon', JSON.stringify({ code: 'LOLA10', percentage: 1e9 }));
```

Ao abrir `/carrinho`:
- `discountAmount = subtotal * 1e9 / 100` → desconto astronômico;
- `CartSummaryCard` calcula `finalTotal = Math.max(0, subtotal + frete - discountAmount)` → **total exibido R$ 0,00**;
- o botão "Comprar pelo WhatsApp" da sacola monta a mensagem com `price: subtotal + frete - discountAmount` → **valor negativo** enviado ao atendimento (`WhatsAppModal.tsx:25`).

No `/checkout` o mesmo estado mostraria o total correto — a inconsistência entre as duas telas é parte do problema.

**Impacto.** O servidor nunca foi enganado: o pré-pedido envia só `couponCode` (`CheckoutPage.tsx:204`) e o backend recalcula via `checkCoupon`. O dano é de **integridade de exibição e de coerência comercial**: a loja mostra um preço que não é o real, o carrinho contradiz o checkout, e a mensagem de WhatsApp enviada ao atendimento contém um valor fabricado. Requer acesso ao `localStorage` do próprio visitante (extensão maliciosa, computador compartilhado, XSS pré-existente), mas a regra "nunca confiar no storage" vale justamente porque ele é o elo mais fraco.

**Correção aplicada.**
- `src/App.tsx:74-83` — nova leitura via `parseStoredCoupon()`: o storage informa **apenas o código**; o percentual é sempre `getCouponPercentage(código)`; código desconhecido, vazio ou > 24 caracteres descarta o cupom inteiro.
- `src/components/cart/CartPage.tsx:57-60` — `discountAmount = getCouponDiscount(coupon?.code, subtotal)`, alinhando sacola e checkout na mesma autoridade.
- `src/components/cart/CartPage.tsx:300` — preço enviado ao WhatsApp travado com `Math.max(0, ...)`.
- `src/data/coupons.ts:85-103` — `getCouponPercentage` agora só aceita propriedade **própria** da tabela, com `Number.isFinite`, `0 < pct <= 100` e teto de tamanho do código.
- `src/utils/checkoutStorage.ts` + `src/utils/__tests__/checkoutStorage.test.ts` — parser testado, incluindo a PoC acima.

---

## ACH-02 — Baixo — Frete do `localStorage` aceitava nome/prazo/preço arbitrários

**Arquivo:** `src/App.tsx:97-109` (antes da correção).

**O que acontecia.** A leitura de `lola_shipping` validava só tipos (`id` string, `name` string, `price` number). O `name` ia direto ao rótulo do resumo financeiro (`shippingLabel` em `CartSummaryCard.tsx` e `CheckoutOrderSummary.tsx`), e um `id` desconhecido era silenciosamente precificado como PAC por `quoteShipping(...)` `default:`. O `price` gravado não era usado em conta (ambas as páginas re-cotam), mas ficava no estado pronto para ser lido por qualquer código futuro.

**PoC concreta:**

```js
localStorage.setItem('lola_shipping', JSON.stringify({
  id: 'pix-fake', name: 'SEDEX GRÁTIS — aprovado pela loja', time: 'hoje', price: 0
}));
```

O resumo exibiria "Frete (SEDEX GRÁTIS — aprovado pela loja)". Sem XSS (React escapa o texto), mas é spoof de um rótulo em contexto financeiro, com string de tamanho ilimitado.

**Correção aplicada.** Tabela canônica extraída para `src/data/shippingOptions.ts` (`listShippingOptions`, `getStoredShippingOption`). O novo `parseStoredShipping()` aceita **só o `id`** e reconstrói nome/prazo/preço da tabela; `id` fora de `pac|sedex|transportadora` descarta a escolha. O modal passou a consumir a mesma tabela (`ShippingCalculatorModal.tsx`), eliminando a duplicação. Teste em `checkoutStorage.test.ts` cobre o spoof acima.

---

## ACH-03 — Baixo — Favoritos do `localStorage` sem validação de tipo ou limite

**Arquivo:** `src/App.tsx:62-73` (antes da correção).

**O que acontecia.** `lola_favorites` era aceito como `Array.isArray(parsed)` sem checar os elementos. Objetos, `null` ou strings de megabytes entravam no estado, eram re-serializados a cada `useEffect` e inflavam o contador do cabeçalho (`favoritesCount`).

**Impacto.** Baixo — `FavoritesModal` filtra contra o catálogo estático (`FEATURED_PRODUCTS.filter(p => favorites.includes(p.id))`), então entradas não-string nunca renderizavam. O efeito real é contagem incorreta no header e risco de bloat/DOM lento. Corrigido por precaução, pois é a mesma classe dos achados acima.

**Correção aplicada.** `parseStoredFavorites()` em `src/utils/checkoutStorage.ts`: só strings não vazias ≤ 120 caracteres, teto de 200 entradas.

---

## ACH-04 — Baixo — Item do carrinho: texto e `image` sem limite de tamanho nem restrição de origem

**Arquivo:** `src/utils/cartStorage.ts` (antes da correção).

**O que acontecia.** `isValidCartItem` checava tipos (`typeof i.name === 'string'`, `typeof i.image === 'string'`) mas não limitava comprimento nem a origem do caminho. O item aceito era o objeto cru do JSON — **incluindo propriedades extras**, que sobreviviam aos `...item` / `...cartItem` dos handlers do `App.tsx` e voltavam ao `localStorage`.

**PoC concreta:**

```js
localStorage.setItem('lola_cart', JSON.stringify([{
  id: 'x', productId: 'x', name: 'A'.repeat(3_000_000),
  price: 0.01, quantity: 1, category: 'Brincos',
  image: 'https://exemplo-de-atacante.com/track.gif',   // URL externa
  __proto__: { polluted: true },                          // chave suja preservada
}]));
```

O `<img src={item.image}>` da sacola (`CartItemCard.tsx:32`, `CartDrawer.tsx:110`, `CheckoutOrderSummary.tsx:95`) dispararia uma requisição para o domínio do atacante — **vazando IP, User-Agent e horário do visitante**, em contradição direta com a política de privacidade exibida no rodapé ("os dados permanecem apenas no seu navegador"). A imagem em `javascript:` não executa em `<img>` em navegadores modernos, então não é XSS; o vetor real é vazamento de privacidade e bloat de DOM.

**Correção aplicada.** `sanitizeCartItem()` reconstrói um objeto **canônico** (só campos conhecidos — chaves sujas como `__proto__` não sobrevivem), com:
- `image` restrita a caminho local: começa com `/` simples, sem `//`, sem `\`, ≤ 300 caracteres;
- textos (`name`, `category`, `variant`, `material`, `color`) ≤ 160 caracteres e sem caracteres de controle;
- `price` finito, `0 ≤ price ≤ 1_000_000`; `quantity` inteiro `1..99`;
- teto de 50 itens por sacola.

---

## ACH-05 — Informativo — Lookup de cupom pela cadeia de protótipo

**Arquivo:** `src/data/coupons.ts:86` (antes) — `VALID_COUPONS[code.trim().toUpperCase()]`.

**O que acontecia.** `VALID_COUPONS` é um objeto comum, então `VALID_COUPONS['constructor']`, `['toString']`, `['valueOf']` devolvem valores *truthy* herdados de `Object.prototype` e passariam pelo `if (percentage)`. Na prática **não era explorável**: o lookup sempre passa por `.toUpperCase()`, e `'constructor'.toUpperCase() === 'CONSTRUCTOR'` não casa com a chave herdada minúscula. Risco latente — se algum dia o `.toUpperCase()` sair, o bug vira NaN no total.

**Correção aplicada.** Guard explícito com `Object.prototype.hasOwnProperty.call(VALID_COUPONS, normalized)` + validação de faixa (`0 < pct ≤ 100`), espelhando o que `src/server/orders.ts:141` já fazia no backend. Teste cobre `constructor`/`toString`.

---

## ACH-06 — Informativo — Modais sem focus trap e sem fechamento por `Escape` (acessibilidade)

**Arquivos:** 12 componentes com `role="dialog" aria-modal="true"` — `InfoModal`, `CartDrawer`, `FavoritesModal`, `ProductDetailModal`, `CouponModal`, `ClearCartModal`, `ShippingCalculatorModal`, `WhatsAppModal`, `OrderSuccessModal`, `MobileFilterDrawer`, `ChatbotAssistente`, `ProductLightboxModal`. A lista original citava `ReportModal` e omitia o `ProductLightboxModal`; o `ReportModal` foi removido do projeto depois da auditoria (ver ACH-07).

**O que acontece.** Nenhum deles prende o foco; só `ProductLightboxModal.tsx:24` trata `Escape`. O foco do teclado continua livre no conteúdo atrás do backdrop.

**Impacto.** Usuário de teclado/leitor de tela fica preso em navegação fora do diálogo. **Não é falha de segurança explorável**, e pedi para reportar acessibilidade "só se for grave" — por isso fica documentado, não corrigido.

**Sugestão (não implementada).** Um hook compartilhado `useDialogA11y(ref, onClose)` que registra `Escape` e um tab-index trap de ~15 linhas, aplicado aos 12 pontos. Corrigir um por um duplica lógica; centralizar é a correção de baixo custo real.

---

## ACH-07 — Informativo — `ReportModal` é código morto no bundle e documenta endpoints internos

> **Atualização (resolvido):** o `ReportModal` e o estado morto no `App.tsx` foram removidos do projeto (commit `daecdd2`) — os caminhos e linhas citados abaixo são do estado registrado na auditoria e não existem mais; a pergunta ao produto no fim da seção foi respondida pela remoção.

**Arquivos:** `src/components/ReportModal.tsx` (477 linhas), `src/App.tsx:122` e `src/App.tsx:709-716`.

**O que acontece.** `isReportModalOpen` só é setado em `false`; **não existe `setIsReportModalOpen(true)` em lugar nenhum**. O modal é inalcançável, mas as 477 linhas entram no bundle de produção. A aba "APIs & Backend" (`ReportModal.tsx:347-368`) lista os endpoints públicos e administrativos da loja, incluindo `POST /api/estoque/atualizar`.

**Impacto.** Baixo/informativo: a rota administrativa exige `x-admin-key` de ≥ 32 caracteres, tem rate limit e guard de origem — conhecer o caminho não a explora. Mesmo assim, é documentação de superfície entregue a qualquer visitante.

**Por que não corrigi (decisão de produto).** Remover o componente muda o que foi entregue ao cliente (é um "Painel de Demonstração" que pode ser pretendido no futuro) e não é um bug de segurança com Exploração real. **Pergunta para a dona do produto:** o `ReportModal` deve continuar no bundle (há previsão de ligar um gatilho a ele), ou pode ser removido junto com o estado morto no `App.tsx`?

---

## Verifiquei e está limpo

Prova de que os vetores pedidos foram inspecionados, não apenas presumidos.

### XSS por dados do servidor
- **Sem** `dangerouslySetInnerHTML`, `innerHTML`, `eval(`, `new Function`, `document.write`, `insertAdjacentHTML` em `src/` (grep de todos os padrões: zero ocorrências).
- `src/services/api.ts:55-71` — `parseAIResponse` valida forma, limita `resposta` a 10 000 chars, `titulo` a 200 e `link` a 300, e só aceita links internos (mesma origem, sem `//`, sem `\`, sem controles). O chatbot renderiza `msg.text` como nó de texto React (`ChatbotAssistente.tsx:231`), não HTML.
- `src/services/api.ts:77-91` — `parseStockPayload` valida `Number.isSafeInteger` e compara `productId` com o esperado.
- `src/services/api.ts:169-197` — `parseDraftOrderConfirmation` valida formato (`/^LOLA-\d{8}-[A-F0-9]{12}$/`), faixas e enums antes de exibir número de pedido.
- `src/services/cep.ts` — ViaCEP é o **único** fetch externo; CEP é saneado para 8 dígitos antes da URL e a resposta é validada campo a campo.

### `href`, `src` e `style` dinâmicos
- `href` dinâmico único: `WhatsAppModal.tsx:26`, construído com URL fixa `https://wa.me/?text=` + `encodeURIComponent(messageText)`. Sem `javascript:`, sem host de fora.
- `src` dinâmico: apenas catálogo estático (`mockData.ts`, caminhos `/images/...`) e itens do carrinho — agora restritos a caminho local pelo ACH-04.
- `style={{...}}`: 3 ocorrências, todas com valor estático ou percentual calculado — nenhuma com dado externo (`ChatbotAssistente.tsx:141`, `CartDrawer.tsx:75`, `FilterSidebar.tsx:262`).

### Open redirect / navegação
- `window.location` é só **lido** (`pathname`), nunca atribuído. Sem `location.href =`, `location.assign`, `location.replace` ou `window.open`.
- `App.tsx:198` — `history.pushState` usa rota fixa + `activeProduct.id` do catálogo interno.

### Links externos
- Os 4 `<a target="_blank">` (`AnnouncementBar.tsx:41`, `SocialSection.tsx:34`, `InfoModal.tsx:75`, `WhatsAppModal.tsx:70`) têm `rel="noopener noreferrer"`.
- Todas as URLs externas vêm de `src/data/siteConfig.ts` (constante) ou da URL fixa do WhatsApp. Nenhuma é concatenada com dado de fora.

### Segredos no bundle
- Nenhuma variável `VITE_` no projeto inteiro (grep em `*.{ts,tsx,html,json}`); nenhum `import.meta.env` em `src/`.
- `GEMINI_API_KEY` só em `server.ts:394` (`process.env`, lado servidor). `LOLA_ADMIN_API_KEY` só em `src/server/adminAuth.ts:34`. Nenhum dos dois entra no gráfico do cliente.
- `vite.config.ts` — `DEV_DENY` cobre `.env*`, `.data/**`, `*.key/pem`, `server.ts`, `data-server.ts`, `package-lock.json`, `tsconfig*.json` e `**/src/server/**` (inclusive source maps).
- `npm run build` gera **um** JS de 478 kB (123 kB gzip), sem source map.

### `document.title` / meta (item f)
- **Não é vetor.** `App.tsx:191-195` faz `document.title = title` e `metaDesc.setAttribute('content', description)`. Ambos gravam **texto** (atributo/text node), não HTML — `<meta name="description" content="<img onerror=...>">` é inócuo. E o `activeProduct.name` que entra aí vem do catálogo estático, não do servidor.

### Outros
- `index.html` sem script inline além do módulo Vite; CSP não é definida pela app (cabe ao servidor — já tratado no backend).
- `.env.example` com todos os valores vazios. Nenhum arquivo `.env` commitado.
- Ciclo de vida: `main.tsx` é mínimo, sem `dangerouslySetInnerHTML` no root.

---

## Correções aplicadas (resumo)

| Arquivo | Mudança |
|---------|---------|
| `src/utils/checkoutStorage.ts` | **Novo.** Parsers testados para `lola_favorites`, `lola_coupon`, `lola_shipping` — storage só informa a escolha, nunca o valor. |
| `src/utils/__tests__/checkoutStorage.test.ts` | **Novo.** 9 testes, incluindo as PoCs do ACH-01/02/03/05. |
| `src/data/shippingOptions.ts` | **Novo.** Tabela canônica de frete + `getStoredShippingOption()`. |
| `src/utils/cartStorage.ts` | `sanitizeCartItem()`: objeto canônico, `image` restrita a caminho local, tamanhos limitados, teto de 50 itens. |
| `src/data/coupons.ts` | `getCouponPercentage` com guard de propriedade própria, faixa e teto de tamanho; exporta `COUPON_CODE_MAX_LENGTH`. |
| `src/App.tsx` | Leituras de `lola_favorites`/`lola_coupon`/`lola_shipping` delegadas aos parsers validados. |
| `src/components/cart/CartPage.tsx` | Desconto recalculado pelo código (`getCouponDiscount`); preço do WhatsApp travado em ≥ 0. |
| `src/components/cart/CouponModal.tsx` | Usa `getCouponPercentage` em vez de acesso direto à tabela; `maxLength` no input. |
| `src/components/cart/ShippingCalculatorModal.tsx` | Passa a consumir a tabela canônica (reexporta tipos/funções para os consumidores existentes). |
| `src/components/checkout/CheckoutOrderSummary.tsx` | `maxLength` no input de cupom. |

**Verificações após a mudança:** `npx tsc --noEmit` limpo · `npx vitest run` → **267 testes verdes** (21 → 22 arquivos; +9 testes novos) · `npx vite build` concluído.

## Decisões pendentes (não corrigidas de propósito)

1. **`ReportModal` (ACH-07):** manter o painel no bundle com gatilho previsto, ou remover junto com o estado morto em `App.tsx`? — **resolvido:** removido no commit `daecdd2`.
2. **Focus trap global (ACH-06):** introduzir o hook compartilhado `useDialogA11y` nos 12 modais, ou deixar para quando houver time de acessibilidade?
3. **Catálogo estático vs. `/api/produtos`:** o front-end ainda renderiza `EARRINGS_CATALOG`/`FEATURED_PRODUCTS` de `mockData.ts`; a rota `GET /api/produtos` existe no backend mas **não é chamada por nenhum componente**. Quando a integração acontecer, o `image` vindo do servidor precisará da mesma restrição de caminho local aplicada aqui ao carrinho — vale registrar essa regra no contrato da API antes da migração.
