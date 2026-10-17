import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import type { AxeResults, Result } from 'axe-core';
import { PRODUTO, semearCarrinho } from './support/catalogo';

/**
 * Camada de acessibilidade das telas principais, com axe-core.
 *
 * Recorte declarado: WCAG 2.0 e 2.1, níveis A e AA (`wcag2a`, `wcag2aa`,
 * `wcag21a`, `wcag21aa`). Violação de impacto `critical` derruba a cena — é o
 * gate desta onda. `serious`, `moderate` e `minor` são dívida conhecida: saem
 * no console e num anexo JSON do relatório para a próxima onda, mas nenhum
 * componente é consertado aqui.
 *
 * A auditoria roda só depois do marcador visível de cada tela, para não medir
 * o balão de carregamento de rota (as páginas entram por `Suspense`).
 *
 * A rota da sacola é `/carrinho` — é o caminho que o `resolveRoute` da própria
 * aplicação reconhece; `/cart` não existe e cairia na home.
 */

const TAGS_WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const IMPACTOS = ['critical', 'serious', 'moderate', 'minor'] as const;
type Impacto = (typeof IMPACTOS)[number];

/** Linha de resumo de cada violação, como sai no console da suíte. */
function resumo(rota: string, impacto: Impacto, violacoes: Result[]): string[] {
  return violacoes.map(
    (violacao) =>
      `[a11y] ${rota} impact=${impacto} regra=${violacao.id} nos=${violacao.nodes.length} :: ${violacao.help}`
  );
}

/** Detalhe por nó (até 5) para a mensagem de falha, com o motivo apontado pelo axe. */
function detalhe(violacao: Result): string {
  const linhas = violacao.nodes.slice(0, 5).map((no) => {
    const motivo = (no.failureSummary ?? '').replace(/\n/g, ' ').trim();
    return `    ${no.target.join(' ')}${motivo ? ` — ${motivo}` : ''}`;
  });
  if (violacao.nodes.length > 5) linhas.push(`    ... e mais ${violacao.nodes.length - 5} nó(s)`);
  return [`  ${violacao.id} (${violacao.impact}): ${violacao.help}`, ...linhas].join('\n');
}

/** Roda o axe na página e registra o recorte WCAG no relatório. */
async function auditar(page: Page, rota: string, arquivo: string): Promise<void> {
  const resultado: AxeResults = await new AxeBuilder({ page }).withTags(TAGS_WCAG).analyze();

  const porImpacto = new Map<Impacto, Result[]>(
    IMPACTOS.map((impacto) => [impacto, resultado.violations.filter((v) => v.impact === impacto)])
  );

  for (const impacto of IMPACTOS) {
    for (const linha of resumo(rota, impacto, porImpacto.get(impacto) ?? [])) console.log(linha);
  }
  const contar = (impacto: Impacto) => (porImpacto.get(impacto) ?? []).length;
  console.log(
    `[a11y] ${rota} — critical=${contar('critical')} serious=${contar('serious')} ` +
      `moderate=${contar('moderate')} minor=${contar('minor')} (regras aprovadas: ${resultado.passes.length})`
  );

  // O laudo completo vai anexado: o relatório HTML guarda o JSON inteiro, com
  // nós, impactos e remediações sugeridas, sem depender do console.
  await test.info().attach(`axe-${arquivo}.json`, {
    body: JSON.stringify(resultado, null, 2),
    contentType: 'application/json',
  });

  const criticas = porImpacto.get('critical') ?? [];
  expect(
    criticas.map((violacao) => violacao.id),
    `Violações críticas de acessibilidade em ${rota}:\n${criticas.map(detalhe).join('\n')}`
  ).toEqual([]);
}

test('a home não tem violação crítica de acessibilidade', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 2, name: 'Produtos em destaque' })).toBeVisible();

  await auditar(page, '/', 'home');
});

test('a página do produto não tem violação crítica de acessibilidade', async ({ page }) => {
  await page.goto(`/produto/${PRODUTO.id}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1, name: PRODUTO.nome })).toBeVisible();

  await auditar(page, `/produto/${PRODUTO.id}`, 'produto');
});

test('a sacola não tem violação crítica de acessibilidade', async ({ page }) => {
  // Mesma sacola semeada das outras cenas (helper), para a auditoria medir a
  // tela de sacola cheia — que é como a cliente a usa.
  await semearCarrinho(page);
  await page.goto('/carrinho', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /Sua sacola/ })).toBeVisible();

  await auditar(page, '/carrinho', 'carrinho');
});

test('o checkout não tem violação crítica de acessibilidade', async ({ page }) => {
  await semearCarrinho(page);
  await page.goto('/checkout', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1, name: 'Checkout' })).toBeVisible();
  await expect(page.getByText(PRODUTO.nome).first()).toBeVisible();

  await auditar(page, '/checkout', 'checkout');
});
