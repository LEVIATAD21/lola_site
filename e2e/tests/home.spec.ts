import { expect, test } from '@playwright/test';
import { PRODUTO } from './support/catalogo';

test('a home carrega com o título da loja e o catálogo visível', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await expect(page).toHaveTitle(/LOLA Aço Inox & Acessórios/);
  await expect(page.getByRole('heading', { level: 2, name: 'Produtos em destaque' })).toBeVisible();
  await expect(page.getByRole('heading', { name: PRODUTO.nome })).toBeVisible();
});

test('a busca encontra um produto conhecido e abre a peça', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await page.getByPlaceholder('O que você procura?').first().fill(PRODUTO.nome);
  await expect(page.getByText('Resultados encontrados')).toBeVisible();

  // O resultado do cabeçalho vem antes dos cartões do catálogo na árvore do DOM.
  const resultado = page.getByRole('button', { name: new RegExp(PRODUTO.nome) }).first();
  await expect(resultado).toBeVisible();
  await resultado.click();

  await expect(page).toHaveURL(new RegExp(`/produto/${PRODUTO.id}`));
  await expect(page.getByRole('heading', { level: 1, name: PRODUTO.nome })).toBeVisible();
});
