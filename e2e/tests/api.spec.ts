import { expect, test } from '@playwright/test';

test('um link de rastreamento inválido mostra a mensagem de recusa', async ({ page }) => {
  // Uma única consulta: a rota tem teto de requisições por minuto e o objetivo
  // aqui é justamente provar o caminho do token errado.
  await page.goto('/rastreio?token=token-invalido-usado-pelo-teste', { waitUntil: 'domcontentloaded' });

  const recusa = page.getByRole('status');
  await expect(recusa).toBeVisible();
  await expect(recusa).toContainText(/inválido|expirado|não encontrado|indisponível/i);
  await expect(page.getByText('Etapas do pedido')).toHaveCount(0);
});

test('GET /api/health responde 200', async ({ request }) => {
  const resposta = await request.get('/api/health');

  expect(resposta.status()).toBe(200);
  const corpo = await resposta.json();
  expect(corpo.status).toBe('ok');
});
