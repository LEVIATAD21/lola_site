# Desempenho — LOLA Aço Inox

Documento do engenheiro de performance (onda 1 · diagnóstico).
Território: apenas `docs/PERF.md`. **Nenhum código foi alterado** — tudo aqui é
diagnóstico e recomendação; a execução cabe à onda 2.

---

## 0. O que é medição e o que é estimativa

Rótulo usado em cada número: **[M]** = medido nesta máquina · **[E]** = estimativa.

| O que foi feito | Resultado |
|---|---|
| `npx vite build` (vite 8.3.4, 1713 módulos, 5,88 s) | **[M]** produção real em `dist/` |
| `npx tsc --noEmit` | **[M]** saiu 0 (sem erros) |
| Tamanho dos arquivos e `gzip -9` deles | **[M]** |
| Composição byte a byte do bundle (`esbuild --metafile`, `bytesInOutput`, mesmo entry) | **[M]** — ver ressalva §1.2 |
| Peso e dimensão das 14 imagens (`file` + PIL 10.2.0) | **[M]** |
| Recompressão experimental das mesmas 14 imagens (PIL: JPEG q75, WebP q75, ≤800 px) | **[M]** |
| Servidor de produção subido em porta alternativa (`NODE_ENV=production npx tsx server.ts`) e `curl` em `/`, no JS e numa imagem | **[M]** |
| `curl` no CSS do Google Fonts (UA de navegador) e download dos `.woff2` de subconjunto `latin`/`latin-ext` | **[M]** |
| Varredura de tags `<img>`, `loading=`, `srcset`, `preload`, imports de rota | **[M]** |
| **Lighthouse / Chrome** | **não executado** — não há Chrome nesta máquina |
| **Dados de campo (CrUX, RUM, web-vitals)** | **não existem** — nenhum coletor instalado |
| LCP, CLS, INP, tempos em rede real | **[E]** — deduzidos dos bytes medidos + premissas declaradas |

Não há medição de laboratório nem de campo neste documento. Onde o número depende
de rede, dispositivo ou navegador, isso está escrito na linha.

---

## 1. Orçamento de performance

### 1.1 O build de produção **[M]**

```
dist/index.html                    1.461 B      gzip   666 B
dist/assets/index-D5CE6En-.css    66.665 B      gzip 11.460 B   (gzip -9: 11.221 B)
dist/assets/index-Ccg99UDt.js    455.900 B      gzip 119.700 B  (gzip -9: 117.989 B)
```

`dist/assets/` contém **exatamente 1 JS e 1 CSS** — confirmação de que **não há
code splitting**: todo o cliente (home, categoria, produto, carrinho, checkout,
4 modais, drawer e chatbot) está em um único chunk descarregado antes de qualquer
pintura. `dist/` no total: 11.316.657 B, quase tudo imagem (§1.3).

### 1.2 O que pesa dentro dos 455.900 B do JS **[M]**

Atribuição por arquivo de origem, medida com `esbuild --metafile` sobre
`src/main.tsx` com os mesmos parâmetros de produção (`--minify`,
`NODE_ENV=production`, `--jsx=automatic`). Soma atribuída: 463.006 B de 467.467 B
(99,0%).

| Grupo | Bytes no bundle | kB | % |
|---|---:|---:|---:|
| `react-dom` | 209.765 | 204,8 | 44,9% |
| shell + home + modais + chatbot (`app:resto`) | 86.491 | 84,5 | 18,5% |
| rota **checkout** (`src/components/checkout/`) | 39.940 | 39,0 | 8,5% |
| rota **produto** (`src/components/product/`) | 34.276 | 33,5 | 7,3% |
| rota **categoria** (`src/components/category/`) | 31.343 | 30,6 | 6,7% |
| rota **carrinho** (`src/components/cart/`) | 26.638 | 26,0 | 5,7% |
| `lucide-react` (44 pontos de import, 52 módulos de ícone) | 11.550 | 11,3 | 2,5% |
| `src/data/mockData.ts` | 10.856 | 10,6 | 2,3% |
| `react` | 8.434 | 8,2 | 1,8% |
| `scheduler` | 3.713 | 3,6 | 0,8% |

Leitura:

- **React + react-dom + scheduler = 221.912 B (47,5%)** — piso de qualquer SPA
  em React; não é "gordura" para cortar sem trocar de biblioteca (§4).
- **Código próprio = 229.544 B (49,1%)**, dos quais **132.197 B (28,3% do
  bundle) só existem numa rota** e hoje entram no download da home.
- **Nada de backend no bundle**: `@google/genai` só é importado por
  `server.ts:5` (medido — ausente do bundle); `express` também não está lá.
- `motion` (framer-motion) está em `dependencies` mas tem **zero imports** no
  código do cliente (medido) — não pesa no bundle, é só item de limpeza de
  dependências (assunto do `supply-eng`).

**Ressalva da ferramenta:** a atribuição veio do esbuild (467.467 B no total),
enquanto o build real usa rolldown (455.900 B) — diferença de 2,5%. Use as
**proporções** e as ordens de grandeza; não trate cada byte acima como o valor
final do artefato publicado.

**Gzip por rota [M]:** reconstruí os grupos de rota como chunks separados
(mesmos componentes, `react` externo, `--splitting`) e medi o gzip de cada um:

| Chunk de rota | minificado | gzip |
|---|---:|---:|
| `checkout.js` | 39.576 B | 10.815 B |
| `categoria.js` | 30.079 B | 7.273 B |
| `produto.js` | 27.395 B | 6.800 B |
| `carrinho.js` | 21.290 B | 5.779 B |
| **soma** | **118.340 B** | **30.667 B** |

Os quatro chunks de rota somam 118.340 B minificados e **30.667 B gzip** — é
quanto um visitante da home deixaria de baixar com code splitting (as diferenças
para os 132.197 B do §1.2 se devem a código compartilhado que foi para chunks
comuns de 30.134 B nesta reconstrução).

### 1.3 Imagens — o maior item do orçamento **[M]**

14 JPEG em `public/images/`, servidos como estão, sem `srcset`, sem `sizes`,
sem `<picture>`, sem conversão para WebP/AVIF (grep: zero ocorrências).

| Arquivo | Dimensões | Bytes | kB |
|---|---|---:|---:|
| `hoop_flatlay_linen_1791584262407.jpg` | 1024×1024 | 1.047.005 | 1.022,5 |
| `product_necklace_1791578719682.jpg` | 1024×1024 | 927.565 | 905,8 |
| `earrings_twisted_hoop_1791580841517.jpg` | 1024×1024 | 856.453 | 836,4 |
| `lola_gift_box_1791590840477.jpg` | 1200×896 | 835.450 | 815,9 |
| `earrings_ear_cuff_1791580851230.jpg` | 1024×1024 | 797.464 | 778,8 |
| `hoop_angle_view_1791584253619.jpg` | 1024×1024 | 796.360 | 777,7 |
| `cart_banner_jewelry_1791585126765.jpg` | 1376×768 | 773.644 | 755,5 |
| `product_bracelets_1791578728452.jpg` | 1024×1024 | 769.255 | 751,2 |
| `product_earrings_1791578709776.jpg` | 1024×1024 | 703.794 | 687,3 |
| `product_rings_1791578737141.jpg` | 1024×1024 | 688.141 | 672,0 |
| `hero_lola_model_1791578690867.jpg` | 1376×768 | 669.123 | 653,4 |
| `earrings_heart_stud_1791580831036.jpg` | 1024×1024 | 658.789 | 643,3 |
| `earrings_pearl_1791580874887.jpg` | 1024×1024 | 649.189 | 634,0 |
| `earrings_teardrop_1791580862381.jpg` | 1024×1024 | 620.399 | 605,9 |
| **total** | | **10.792.631** | **10.539,7 (10,29 MiB)** |

Média de **753 kB por imagem**. Onze das catorze são 1024×1024 e aparecem em
cards de ~170–270 px de largura (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-5`).

**A home usa 5 dessas arquivos (deduplicado), 3.757.878 B = 3.669,8 kB:**
`hero_lola_model` (653,4), `product_bracelets` (751,2), `product_earrings`
(687,3), `product_necklace` (905,8), `product_rings` (672,0).

**`loading="lazy"` [M]:** há **29 tags `<img>`** no código; **9 têm
`loading="lazy"`**, **20 não têm**:

| Arquivo:linha | componente | `lazy` | contexto |
|---|---|---|---|
| `HeroCarousel.tsx:41` | carrossel do hero | não | **home, acima da dobra — é o LCP** |
| `CartBanner.tsx:8` | banner do carrinho | não | rota carrinho, 755 kB |
| `CheckoutPage.tsx:237` | banner do checkout | não | rota checkout, 755 kB |
| `CheckoutOrderSummary.tsx:254` | caixa de presente | não | rota checkout, 816 kB |
| `CheckoutOrderSummary.tsx:95` | miniatura de item | não | rota checkout |
| `CategoryBanner.tsx:17` | banner da categoria | não | rota categoria, 653 kB |
| `CategorySecondaryBanner.tsx:32` | círculo de 144–176 px | não | rota categoria, **653 kB num círculo** |
| `ProductEditorialBanner.tsx:19` | círculo de 96–112 px | não | rota produto, **653 kB num círculo** |
| `ProductDetailsSection.tsx:40` | foto de detalhe | não | rota produto |
| `ProductGallery.tsx:64` | imagem principal | não | rota produto |
| `ProductGallery.tsx:142` | thumb do lightbox | não | rota produto |
| `ProductLightboxModal.tsx:84` e `:114` | lightbox | não | modal |
| `CartDrawer.tsx:109` | item do drawer | não | só com drawer aberto |
| `CartItemCard.tsx:31` | item do carrinho | não | rota carrinho |
| `FavoritesModal.tsx:85` | item do favoritos | não | só com modal aberto |
| `InfoModal.tsx:56` | post do Instagram | não | só com modal aberto |
| `ProductDetailModal.tsx:78` | foto do produto | não | só com modal aberto |
| `SiteHeader.tsx:256` | resultado de busca | não | só com busca ativa |
| `ChatbotAssistente.tsx:193` | foto no contexto do chat | não | só com chat aberto |
| `CategorySection.tsx:45` · `FeaturedProductsSection.tsx:126` · `SocialSection.tsx:57` · `EarringProductCard.tsx:63,156` · `CartPage.tsx:217` · `CheckoutPage.tsx:396` · `ProductGallery.tsx:49` · `RelatedProductsSection.tsx:95` | cards e thumbs | **sim** (9) | |

Detalhe importante: os 4 modais/drawer retornam `null` quando fechados
(`CartDrawer.tsx:26`, `ProductDetailModal.tsx:39`, `FavoritesModal.tsx:24`,
`InfoModal.tsx:21`) e o chat só monta a foto com o chat aberto — **então, na
primeira pintura da home, só 1 tag `<img>` é eager: a do hero (653,4 kB)**. As
outras 4 imagens da home têm `loading="lazy"`, mas ficam a poucos pixels da
dobra e o navegador as busca logo em seguida: **na prática a home puxa 3.670 kB
de imagem**.

**Recompressão — medido, não estimado [M]:** reencodei as 14 imagens com PIL
10.2.0 (mesmo nome de arquivo, mesmo domínio, sem mexer em código):

| Cenário | Total das 14 | Redução |
|---|---:|---:|
| original | 10.540 kB | — |
| JPEG q75 progressivo, **mesmas dimensões** | 1.668 kB | **−84%** |
| WebP q75, mesmas dimensões | 1.120 kB | **−89%** |
| WebP q75, máx. 800 px | 712 kB | **−93%** |

Só a imagem do hero (o LCP): **653 kB → 69 kB** em JPEG q75 · **→ 30 kB** em
WebP q75 · **→ 13 kB** em WebP ≤800 px.

Para a home: 3.670 kB → **558 kB** (JPEG q75) ou **343 kB** (WebP q75) —
**economia de 3.327 kB por visita fria**, sem mudar uma linha de código se
reencodar no mesmo arquivo.

### 1.4 Quanto sai na primeira visita à home **[M]**

Servidor de produção real (`NODE_ENV=production`), somando os bytes medidos:

| Recurso | Bytes no fio | % |
|---|---:|---:|
| 5 imagens da home | 3.757.878 | 87,7% |
| JS (1 chunk) | 455.900 | 10,6% |
| CSS | 66.665 | 1,6% |
| CSS do Google Fonts | 1.295 | 0,03% |
| HTML | 1.461 | 0,03% |
| **total** | **4.283.199 (4,08 MiB)** | |

(O CSS do Google Fonts tem 31.135 B brutos, mas a Google o serve com brotli —
1.295 B no fio; entram aqui os bytes que trafegam de fato.)

**Imagem é 88% do custo de uma visita fria.** Qualquer ação que não toque em
imagem mexe em 12% do problema.

### 1.5 O que o servidor faz com esses bytes **[M]**

`curl` contra `NODE_ENV=production npx tsx server.ts` (porta alternativa,
depois encerrado):

```
GET /assets/index-Ccg99UDt.js
  Accept-Encoding: gzip, br
  → HTTP/1.1 200 · Content-Length: 455900 · SEM Content-Encoding
GET /images/hero_lola_model_...jpg  → Content-Length: 669123 · SEM Content-Encoding
GET /  (idem JS, imagem e HTML)     → Cache-Control: public, max-age=0
Revalidação com If-None-Match       → 304 Not Modified (funciona)
```

Dois achados:

1. **O JS sai cru.** `server.ts:566` usa `express.static(...)` puro, sem
   middleware de compressão e sem `compression`/`zlib` em `package.json`
   (grep: zero). Mesmo com o cliente pedindo `Accept-Encoding: gzip, br`, os
   **455.900 B vão inteiros pela rede** — o gzip seria 117.989 B. No CSS,
   66.665 B → 11.221 B. **393 kB por visita fria, sem necessidade.**
2. **Nada é cacheado.** `max-age=0` em HTML, JS, CSS e imagens. Na home, uma
   visita repetida revalida **HTML + JS + CSS + 5 imagens**; um passeio pelo
   site inteiro, mais. O ETag funciona (304 confirmado), então não há
   redownload, mas há **1 ida e volta por asset** e nenhuma imunidade a
   latência. Os assets do Vite já têm hash no nome (`index-Ccg99UDt.js`), então
   `max-age=31536000, immutable` é seguro para `dist/assets/*`.

### 1.6 Fontes **[M]**

`index.html:14` carrega 4 famílias do Google Fonts. Medido com `curl` (UA de
navegador):

- CSS bruto: **31.135 B**, **78 declarações `@font-face`**, **todas com
  `font-display: swap`** — o `display=swap` da URL está correto e é aplicado.
- No fio: **1.295 B** (a Google serve com brotli/gzip) e
  `Cache-Control: max-age=86400`.
- `index.html:12-13` já faz `preconnect` para `fonts.googleapis.com` e
  `fonts.gstatic.com` (com `crossorigin` no segundo) — correto.
- Quebra por família: Montserrat 30 blocos/10.918 B · Playfair Display
  20/7.955 B · **Cormorant Garamond 25/9.760 B (31% do CSS)** · Alex Brush
  3/1.210 B.
- Quebra por subconjunto: latin 7.096 B · latin-ext 7.543 B · **vietnamese
  6.829 B · cyrillic 4.861 B · cyrillic-ext 3.514 B** — **15.204 B (51%) de
  subconjuntos que um site pt-BR nunca usa.**

Resposta direta à pergunta: **as fontes do Google não bloqueiam a renderização
do texto** (`display=swap` confirmado no CSS retornado). O `<link
rel="stylesheet">` em si continua sendo render-blocking (é a regra do
navegador), mas são 1.295 B no fio, com preconnect e cache de 24 h — problema
pequeno.

**O que custa de verdade são os arquivos de fonte [M]** (`.woff2`, baixados um
por família/peso/subconjunto):

| Família | pesos `latin` estáticos | total | um arquivo variável `latin` |
|---|---|---:|---:|
| Montserrat (300/400/500/600/700) | 5 × 37,1 kB (+ itálico 18,8) | 185,5 kB | **37,1 kB** (300–700) |
| Playfair Display (400/500/600/700) | 4 × 37,5 kB (+ itálico 21,4) | 150,0 kB | **37,5 kB** (400–700) |
| Alex Brush (400) | 1 × 32,5 kB | 32,5 kB | 32,5 kB (sem variável) |
| Cormorant Garamond (5 pesos) | 5 × ~36 kB | 170,3 kB | **0 (não usar)** |
| **soma latin das 3 famílias usadas** | 10 arquivos | **368,0 kB** | **107,1 kB** |

Trocar as três famílias estáticas pelas **variáveis** na mesma URL economiza
**~261 kB de `.woff2`** por visita fria (medido, arquivo a arquivo), mantendo os
mesmos pesos. Como o site usa Montserrat nos pesos 300/400/500/600/700
(contagem de classes no código: semibold 170, medium 81, normal 15, bold 12,
light 11) e Playfair/Alex Brush nos títulos, é plausível que o navegador baixe
a maior parte desses 368 kB — mas **quantos ele baixa de fato depende do texto
renderizado e não foi medido em navegador**.

---

## 2. Core Web Vitals prováveis

> **Isto não é medição de campo.** Não há Chrome/Lighthouse nesta máquina nem
> coletor de web-vitals no site. Os três indicadores abaixo são **[E]
> estimativas** derivadas dos bytes medidos no §1 e das premissas declaradas em
> cada um. Faixas propositalmente largas.

### LCP — **[E]** ~6–8 s em 4G, "ruim"

**Candidato (medido no código):** o `<img>` do hero,
`src/components/HeroCarousel.tsx:41`, que ocupa a largura toda e
`min-h-[460px] sm:min-h-[540px] lg:min-h-[620px]` — maior elemento visível
inicialmente. Os 3 slides usam o mesmo arquivo (`HERO_SLIDES`, `mockData.ts:49`),
ou seja, **uma** imagem de 669.123 B.

**Cadeia crítica (cada elo medido):**
1. HTML 1.461 B **[M]**.
2. CSS local 66.665 B + CSS do Google Fonts (31.135 B brutos · 1.295 B no
   fio), ambos `<link rel="stylesheet">` no `<head>` → bloqueiam a
   renderização até chegarem **[M]** no HTML / regra do navegador **[E]**.
3. JS de 455.900 B **sem compressão no fio [M]** → download, parse e execução
   de React. Até aqui o `#root` está vazio.
4. Só **depois** da execução do React o `<img>` do hero é criado e o download
   de 669.123 B começa **[M]** — não há `<link rel="preload">` nem
   `fetchpriority` em lugar nenhum (grep: 0) **[M]**.
5. Fontes com `swap` não entram aqui (não bloqueiam pintura) **[M]**.

**Premissas [E]:** rede 4G fixa ~1,5 Mb/s, RTT ~150 ms, 3–4 idas e voltas de
TLS/DNS. **[E]** JS ≈ 2,4 s · imagem ≈ 3,6 s · RTTs ≈ 0,5 s → **LCP ≈ 6–8 s**
(faixa "ruim" = >2,5 s). A faixa é larga porque a latência real da rede não
foi medida aqui.

**Cenário pós-ação [E]:** com compressão (JS 455.900 → ~118.000 B), hero
recomprimida (669.123 → ~69.000 B) e `preload`/`fetchpriority` da imagem,
o mesmo raciocínio dá **~1,5–2,5 s** — limítrofe entre "precisa de melhoria" e
"bom". Nada disso vale sem medição depois de implementado.

### CLS — **[E]** provavelmente bom (< 0,1)

A favor (medido no código):
- Cards, galeria e thumbs reservam espaço com `aspect-[4/3]`/`aspect-square`
  (13 usos) — a caixa existe antes da imagem chegar.
- Hero e banners de largura total usam `min-h-[…]` com a imagem em
  `absolute inset-0` (`HeroCarousel.tsx:40`, `CartBanner.tsx:7`,
  `CategoryBanner.tsx:16`) → sem salto quando a foto carrega.
- Os banners com foto em tamanho fixo já têm dimensão no container
  (`CategorySecondaryBanner.tsx:31` = círculo de 144–176 px,
  `ProductEditorialBanner.tsx:18` = círculo 96 px).
- Miniaturas de carrinho/checkout têm tamanho fixo (`w-12 h-12`, `w-10 h-10`,
  `w-6 h-6`).

Contra (medido):
- **Nenhuma tag `<img>` tem `width`/`height`** (grep: 0). O layout hoje depende
  inteiramente dos containers — se algum deles perder a `aspect-*`, há salto.
- Troca de fonte com `display=swap`: o texto nasce na fonte do sistema e migra
  para a webfont **[E]** — causa deslocamento quando as métricas diferem; não
  foi medido.

Risco residual **[E]**: modais e drawer montados dinamicamente já abrem com
dimensões fixas, então o salto esperado é pequeno.

### INP — **[E]** provavelmente bom (<200 ms), evidência fraca

O que dá segurança (medido):
- Nenhuma consulta de rede bloqueia o render: `getProductStock` é chamado só
  dentro de handlers assíncronos (`App.tsx:253` em `handleAddToCart` e
  `App.tsx:342` em `handleUpdateCartQuantity`), nunca em `useEffect` de
  montagem.
- ViaCEP é chamado só em `handleCepSearch`
  (`CheckoutPage.tsx:116` → `cep.ts:18`), disparado pelo usuário, e a rota
  checkout nem está montada na home (`App.tsx:596`).
- Efeitos de montagem são baratos: gravações em `localStorage`, `document.title`
  e `pushState` (`App.tsx:103–205`).
- **Resposta direta: nem `getProductStock` nem ViaCEP bloqueiam a primeira
  pintura.** A primeira pintura depende de HTML + 2 CSS + 455.900 B de JS +
  imagem do hero.

Ponto de atenção (medido): a árvore inteira fica viva — as 5 rotas alternam por
`pageView` (`App.tsx:509–610`), os 4 modais retornam `null` quando fechados, o
drawer também, e o chatbot fica montado o tempo todo (`App.tsx:672`) embora
renderize só o botão.

**Limite desta estimativa:** INP é interação × trabalho na thread principal em
dispositivo real. Sem RUM, não dá para afirmar mais do que isso. Antes de
priorizar INP, instale um coletor (`web-vitals`) e colete dado.

---

## 3. Ações ranqueadas (kB economizado ÷ esforço)

Ranking por **byte que sai da rede na primeira visita** dividido por esforço,
com a certeza do número. **Nenhuma foi executada aqui** — verificação de quem
executa na coluna "titular".

| # | Ação | Ganho medido (1ª visita) | Esforço | Onde | Titular provável |
|---|---|---|---|---|---|
| 1 | Recomprimir/redimensionar as 14 imagens | **−3.327 kB** na home (3.670 → 343 kB, WebP q75); **−9.420 kB** no estoque todo (10.540 → 1.120 kB) | baixo | `public/images/*` | catálogo/dados |
| 2 | gzip/brotli no `express.static` | **−393 kB** (JS 455.900→117.989; CSS 66.665→11.221) | baixo | `server.ts:566` | backend/infra |
| 3 | Fontes variáveis no lugar das estáticas | **até −261 kB** de `.woff2` (368 → 107 kB latin; o valor real depende de quantos pesos o navegador buscar) | muito baixo (1 linha) | `index.html:14` | SEO/frontend |
| 4 | `React.lazy` nas 4 rotas | **−132 kB** do bundle inicial (−30,7 kB gzip) | médio | `App.tsx:15–18` | `fe-perf` (onda 2) |
| 5 | `preload` + `fetchpriority` da imagem do hero | 0 kB; **[E]** −0,3 a −0,6 s de LCP | muito baixo | `index.html` + `HeroCarousel.tsx:41` | SEO/frontend |
| 6 | `Cache-Control: immutable` em `dist/assets/*` | 0 kB na 1ª; elimina 2 revalidações nas seguintes | baixo | `server.ts:566` | backend/infra |
| 7 | `loading="lazy"` nos 20 `<img>` restantes (menos o hero) | pequeno e em boa parte já coberto | baixo | tabela §1.3 | frontend |
| 8 | Podar Cormorant Garamond + subconjuntos não usados do Google Fonts | ~400 B no fio (CSS) + 0 de fonte (hoje não baixa) | muito baixo | `index.html:14` | SEO/frontend |

### 1. Imagens — maior ganho absoluto, esforço baixo **[M]**

Corte exato: reencodar os 14 arquivos de `public/images/` mantendo **o mesmo
nome de arquivo** (assim nenhum `src` em `src/data/mockData.ts` muda).
Alternativa mais agressiva: WebP com o mesmo nome (navegadores atuais) ou
`<picture>` com fallback.

Alvos medidos, arquivo a arquivo (JPEG q75 → WebP q75 → WebP ≤800 px):

```
hoop_flatlay_linen   1.022 → 202 → 108 kB      lola_gift_box          816 → 136 →  47 kB
product_necklace      906 → 170 →  84 kB       earrings_ear_cuff      779 → 134 →  67 kB
earrings_twisted_hoop 836 → 153 →  79 kB       hoop_angle_view        778 → 132 →  61 kB
cart_banner_jewelry   756 → 117 →  29 kB       product_bracelets      751 → 119 →  55 kB
product_earrings      687 → 101 →  41 kB       product_rings          672 →  99 →  42 kB
hero_lola_model       653 →  69 →  13 kB       earrings_heart_stud    643 →  86 →  33 kB
earrings_pearl        634 →  80 →  30 kB       earrings_teardrop      606 →  70 →  22 kB
```

Duas imagens merecem menção específica, por absurdo de escala:
`category/CategorySecondaryBanner.tsx:32` e `product/ProductEditorialBanner.tsx:19`
servem `hero_lola_model` (**653 kB**) dentro de um círculo de **144–176 px** e
**96–112 px** respectivamente.

Cuidado: conferir qualidade visual antes de publicar (a numeração q75 é uma
escolha minha, não um padrão da loja) e manter a resolução mínima que o
lightbox/ProductGallery exige.

### 2. Compressão HTTP **[M]**

Corte exato, `server.ts:566`:

```ts
app.use(express.static(path.resolve(__dirname, 'dist')));
```

Hoje essa linha entrega `Content-Length: 455900` sem `Content-Encoding` mesmo
recebendo `Accept-Encoding: gzip, br`. Precisa de um middleware de compressão
antes dela (dependência `compression` ou middleware próprio com `zlib`, sempre
com `Vary: Accept-Encoding` e proteção contra compressão de resposta já
comprimida). Ganho garantido: **393 kB na primeira visita fria**.

### 3. Fontes variáveis **[M]**

Corte exato, `index.html:14` — trocar

```
Montserrat:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400
Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400
Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400
```

por `Montserrat:wght@300..700` e `Playfair+Display:wght@400..700`, **sem
Cormorant Garamond** (`.font-cormorant`, `src/index.css:24–26`, tem **0 usos**
no código; o `font-serif-brand` já tem Georgia como fallback). Mantido
`display=swap`.

Efeito medido: 1 arquivo variável de 37,1 kB no lugar de 5 estáticos de 185,5 kB
(Montserrat); 37,5 kB no lugar de 150,0 kB (Playfair); −170 kB de Cormorant que
hoje não é baixado de qualquer forma. **~261 kB a menos por visita fria.**
Itálico: só 4 ocorrências no código (`ShippingCalculatorModal.tsx:177`,
`SiteFooter.tsx:195,230`, `ProductDetailModal.tsx:195`) — se quiser manter
itálico real, some `;1,400` e ainda assim fica muito abaixo dos 5 arquivos
estáticos.

### 4. Code splitting por rota **[M]** · implementação = `fe-perf`

Corte exato, `src/App.tsx:15–18` (imports usados **uma única vez cada**, num
ramo de `pageView`):

```ts
15: import { EarringsCategoryPage } from './components/category/EarringsCategoryPage';   // usado só em 547
16: import { ProductDetailPage }     from './components/product/ProductDetailPage';      // só em 560
17: import { CartPage }              from './components/cart/CartPage';                  // só em 575
18: import { CheckoutPage }          from './components/checkout/CheckoutPage';          // só em 596
```

Viram `React.lazy(() => import(...))` com `<Suspense>` no ponto de render
(`App.tsx:509–610`). Ganho medido: **132.197 B (28,3%)** fora do download da
home; em gzip, **30.667 B** (medido por chunk no §1.2).

Candidatos secundários, mesmos critérios: `ChatbotAssistente`
(`App.tsx:19`, montado sempre, 8,3 kB minificados) e os modais
`ProductDetailModal`/`FavoritesModal`/`InfoModal` — mas eles já retornam
`null`, então o ganho é só de execução, não de rede. **Não faz sentido
particionar `mockData` (10,6 kB, usado em toda rota) nem o CSS.**

Observação de fronteira: `src/App.tsx` é território do `fe-perf` (onda 2) —
aqui fica só a recomendação.

### 5. `preload`/`fetchpriority` do hero **[E]** · fazer depois da ação 1

`index.html` ganha `<link rel="preload" as="image" href="/images/hero_lola_model_1791578690867.jpg" fetchpriority="high">`
e `HeroCarousel.tsx:41` ganha `fetchpriority="high"`. Hoje a imagem só é
descoberta depois que os 455.900 B de JS executam. **Só vale a pena depois que
a imagem for recomprimida** — adiantar o download de 653 kB não resolve nada;
adiantar 69 kB resolve. Estimativa de ganho: 0,3–0,6 s de LCP (depende de RTT,
não medido).

### 6. Cache de assets com hash **[M]**

Mesmo ponto de corte do `server.ts:566` (via `setHeaders` do `express.static`):
`/assets/*` com `Cache-Control: public, max-age=31536000, immutable` (o nome já
tem hash). Hoje `public, max-age=0` em tudo — medido. Gasto de banda na 1ª
visita: zero; nas seguintes: elimina a revalidação.

### 7. `loading="lazy"` nos 20 `<img>` restantes **[M]**

Lista completa no §1.3. Regra: **manter eager só o `HeroCarousel.tsx:41`** (é o
LCP; pôr `lazy` nele pioraria a métrica). Prioridade entre os 20:
`CategorySecondaryBanner.tsx:32` e `ProductEditorialBanner.tsx:19` (653 kB
dentro de círculos de 144–176 px e 96–112 px) → melhor tratados pela ação 1;
depois `CartBanner.tsx:8`, `CheckoutPage.tsx:237`, `CheckoutOrderSummary.tsx:254`.
Observação honesta: `loading="lazy"` não reduz o peso da imagem, só adia o
download — **não substitui a ação 1**.

### 8. Podar o pedido de fontes **[M]**

`index.html:14`: remover `Cormorant+Garamond` (31% do CSS, 0 usos) e, se quiser
enxugar os 15.204 B de subconjuntos cirílicos/vietnamitas, restringir a
`latin,latin-ext`. Ganho no fio: **~400 B** — é a ação de menor retorno da
lista, feita por ser de uma linha.

---

## 4. O que NÃO vale a pena fazer

Tão importante quanto o ranking acima. Cada item tem o número que justifica a
desistência.

1. **Trocar React por Preact/Svelte ou reescrever componentes para "cortar os
   44% do react-dom".** react-dom são 204,8 kB minificados (**[E]** ~53 kB
   gzip, aplicada a taxa de 26% medida no bundle). Mesmo com uma troca
   cirúrgica, o ganho real ficaria na casa de dezenas de kB gzip contra um
   risco enorme de regressão funcional/a11y num checkout. As imagens comem 88%
   do transfer — a ordem do problema está invertida.
2. **Particionar o CSS (crítico/não-crítico) ou migrar de Tailwind.** O CSS
   inteiro tem 66.665 B e **11.460 B gzip**. Mexer nisso para ganhar 2–3 kB
   gzip custa mais do que vale, e o `@import "tailwindcss"` (v4) é o que gera as
   utilidades.
3. **Remover `lucide-react`.** São 11.550 B (2,5% do bundle) e o tree-shaking
   já está funcionando: 44 pontos de import viram 52 módulos de ícone. Custo de
   troca por SVG manual, benefício ~3 kB gzip.
4. **Dividir `mockData` (10.6 kB) ou adiar seu carregamento.** É usado por
   todas as rotas (hero, categorias, produtos, carrinho) — adiar só transferiria
   o custo para depois, com risco de tela vazia.
5. **Service worker / PWA / prefetch de todas as rotas.** Não há dado de uso
   nem de retorno; prefetch faria o navegador baixar justamente os 132 kB que a
   ação 4 tenta tirar do caminho crítico, e ainda introduz invalidação de
   cache para manter.
6. **Otimizar INP sem medição.** Hoje é uma estimativa fraca (§2). Priorizar
   trabalho de interação sem RUM é chute; instalar `web-vitals` primeiro.
7. **`loading="lazy"` no hero ou `preload` de todas as imagens.** O primeiro
   piora o LCP; o segundo disputa banda com o hero e piora o que já é 88% do
   custo.
8. **Perseguir os 2,5% de diferença entre esbuild e rolldown**, ou trocar de
   minificador buscando bytes. A diferença medida é 467.467 B vs 455.900 B —
   dentro do ruído de ferramenta.
9. **Esperar `motion` (framer-motion) sair do bundle — ele não está lá.**
   Zero imports no cliente (medido). Remover a dependência é higiene de
   lockfile, não performance (e é território do `supply-eng`).
10. **Trabalhar em `dist/` na mão.** É artefato regenerável (`gitignore`).

---

## 5. Lacunas declaradas

Para quem for priorizar depois destes números:

- **Sem Lighthouse/Chrome nesta máquina** → nenhum valor de FCP/LCP/TBT é de
  laboratório. Rodar Lighthouse (mobile, throttling padrão) antes e depois de
  cada ação é a confirmação barata que falta.
- **Sem CrUX/RUM** → não sei o tráfego real nem o dispositivo típico do público
  da loja. Se o público é majoritariamente celular 4G, o §2 é otimista.
- **Não medi quantos `.woff2` o navegador de fato baixa** (depende do texto
  renderizado); medi o custo de cada arquivo.
- **Não medi TTFB nem comportamento atrás de CDN/proxy** — o `server.ts` tem
  `TRUST_PROXY` (`server.ts:48`) e está fora do alcance deste documento.
- **Não rodei `vitest`** (regra da coordenação) e **não fiz push**. Verificação
  executada: `npx vite build` e `npx tsc --noEmit` (saída 0).
