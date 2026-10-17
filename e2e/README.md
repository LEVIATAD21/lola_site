# Suíte E2E — LOLA Aço Inox & Acessórios

Testes ponta a ponta com Playwright, escritos contra o servidor de
desenvolvimento que já está de pé em `http://127.0.0.1:3000`.

## Como rodar

```bash
cd e2e
npm ci                      # instala exatamente o lockfile de e2e/
npx playwright install chromium   # baixa o navegador para ~/.cache/ms-playwright
npx playwright test --workers=1
```

O relatório HTML fica em `e2e/playwright-report/` (`npm run relatorio`).

> O `npm ci` só pode ser rodado **de dentro de `e2e/`**. A raiz do
> repositório compartilha o mesmo `node_modules` entre worktrees e instalar lá
> derruba o ambiente de todo mundo.

## O que a suíte cobre

| Cena | Arquivo |
|---|---|
| Home carrega com título correto e catálogo visível | `tests/home.spec.ts` |
| Busca encontra um produto conhecido | `tests/home.spec.ts` |
| Rota direta `/produto/<id>` renderiza sem JS quebrado | `tests/produto.spec.ts` |
| Adiciona à sacola e o total aparece | `tests/produto.spec.ts` |
| Checkout abre com campos e linguagem demonstrativa de pagamento/frete | `tests/checkout.spec.ts` |
| Cupom inválido é recusado na vitrine | `tests/carrinho-cupom.spec.ts` |
| Pré-pedido válido chega à tela de sucesso | `tests/checkout.spec.ts` |
| `/rastreio?token=<inválido>` mostra recusa | `tests/api.spec.ts` |
| `GET /api/health` responde 200 | `tests/api.spec.ts` |

Dados de produto, preço e cupom vêm de `src/data/mockData.ts` e
`src/data/coupons.ts`; nada é inventado (ver `tests/support/catalogo.ts`).

## Regras que a suíte segue

- **Uma única chamada a `POST /api/pedidos/rascunho`** em toda a suíte (só a
  cena de fluxo feliz envia pré-pedido) e **uma única consulta** à rota de
  rastreamento, porque as duas têm teto por minuto. Se o limite derrubar uma
  cena, isso é achado — não se "conserta" subindo o teto.
- `--workers=1`: as cenas compartilham os limites por IP do servidor que está
  de pé, e paralelizar transformaria isso em falso negativo.
- Sem esperas fixas: tudo usa auto-espera dos locators (`getByRole`,
  `expect(...).toBeVisible()`).
- Pagamento e frete são **demonstração por decisão do produto**; a suíte
  verifica que a linguagem de demonstração está na tela e não espera cobrança
  real.
- A consulta de CEP da cena de checkout é respondida por um roteamento local
  (`page.route`) para não depender do ViaCEP na rede.
- A cena de pré-pedido semeia a sacola pelo armazenamento local
  (`tests/support/catalogo.ts`) para isolar o checkout; a inclusão de produto
  na sacola é coberta pela cena própria, em `tests/produto.spec.ts`.
- Locators do formulário de entrega aceitam rótulo associado **ou** placeholder
  (`tests/support/formulario.ts`): a superfície da tela mudou uma vez durante
  esta onda e a suíte não deve quebrar quando mudar de novo.

## Observação sobre `/rastreio`

A cena do token inválido aceita qualquer mensagem de recusa
(`inválido | expirado | não encontrado | indisponível`) e exige que a linha do
tempo do pedido não apareça. Contra o servidor que estava de pé na execução de
referência, a API responde `404 {"error":"Endpoint de API não encontrado."}`
para token desconhecido — o texto amigável `Link de rastreamento inválido ou
expirado.` só existe quando o store de rastreamento do servidor está
disponível. Isso é achado de comportamento, não da suíte.

> **Atualização (17/10):** o dev server foi reiniciado no HEAD da `main`; a
> rota existe e responde `404 {"error":"Link de rastreamento inválido ou
> expirado."}` para token desconhecido. A observação acima fica como registro
> histórico da suíte contra o processo defasado.
