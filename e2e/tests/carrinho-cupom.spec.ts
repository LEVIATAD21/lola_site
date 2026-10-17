import { expect, test } from '@playwright/test';
import { CUPOM_INVALIDO, semearCarrinho } from './support/catalogo';

test('um cupom inválido é recusado na vitrine, sem aplicar desconto', async ({ page }) => {
  await semearCarrinho(page);
  await page.goto('/carrinho', { waitUntil: 'domcontentloaded' });

  await page.getByRole('button', { name: 'Adicionar', exact: true }).click();

  const dialogo = page.getByRole('dialog');
  await expect(dialogo).toBeVisible();
  await dialogo.getByPlaceholder('Ex: LOLA10').fill(CUPOM_INVALIDO);
  await dialogo.getByRole('button', { name: 'Aplicar' }).click();

  // A recusa pode ser a frase da vitrine ou a frase vinda da regra do servidor;
  // o que não pode acontecer é o modal fechar como se o cupom tivesse valido.
  const recusa = dialogo.getByText(/cupom/i).filter({ hasText: /não|inválid|expirou/i }).first();
  await expect(recusa).toBeVisible();
  await expect(dialogo).toBeVisible();

  // O código recusado não pode aparecer aplicado no resumo da sacola.
  await expect(page.getByText(`(${CUPOM_INVALIDO})`)).toHaveCount(0);
});
