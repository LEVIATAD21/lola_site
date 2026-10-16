import { expect, test } from '@playwright/test';
import { PRODUTO } from './support/catalogo';

test('a rota direta /produto/<id> renderiza sem JavaScript quebrado', async ({ page }) => {
  const errosDePagina: Error[] = [];
  page.on('pageerror', (erro) => errosDePagina.push(erro));

  await page.goto(`/produto/${PRODUTO.id}`, { waitUntil: 'domcontentloaded' });

  await expect(page).toHaveTitle(new RegExp(PRODUTO.nome));
  await expect(page.getByRole('heading', { level: 1, name: PRODUTO.nome })).toBeVisible();
  await expect(page.getByText(PRODUTO.preco).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Adicionar à sacola' })).toBeEnabled();

  // Overlay de erro do Vite e exceções não capturadas significam build/JS quebrado.
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  expect(errosDePagina).toEqual([]);
});

test('adiciona à sacola e o total aparece na sacola', async ({ page }) => {
  await page.goto(`/produto/${PRODUTO.id}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Adicionar à sacola' }).click();
  await expect(page.getByRole('heading', { name: 'Adicionado à sacola!' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Sacola de compras, 1 itens/ })).toBeVisible();

  await page.goto('/carrinho', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /Sua sacola/ })).toBeVisible();
  await expect(page.getByText('Resumo do pedido')).toBeVisible();

  const linhaDoTotal = page.getByText('Total', { exact: true }).locator('..');
  await expect(linhaDoTotal).toContainText(PRODUTO.preco);
});
