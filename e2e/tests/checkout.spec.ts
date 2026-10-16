import { expect, test } from '@playwright/test';
import { ENDERECO, PRODUTO, semearCarrinho } from './support/catalogo';
import { campo } from './support/formulario';

test('o checkout abre com os campos de entrega e a linguagem demonstrativa', async ({ page }) => {
  await page.goto('/checkout', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { level: 1, name: 'Checkout' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '1. Dados de entrega' })).toBeVisible();
  await expect(campo(page, /Nome completo/, 'Digite seu nome completo')).toBeVisible();
  await expect(campo(page, /Telefone/, '(00) 00000-0000')).toBeVisible();
  await expect(campo(page, /CEP/, '00000-000')).toBeVisible();
  await expect(campo(page, /Logradouro/, 'Rua ou avenida (preenchido pelo CEP)')).toBeVisible();
  await expect(campo(page, /Número/, 'Nº da casa')).toBeVisible();
  await expect(campo(page, /Bairro/, 'Bairro')).toBeVisible();
  await expect(campo(page, /Cidade/, 'Digite a cidade')).toBeVisible();
  await expect(page.getByRole('combobox', { name: /Estado/ })).toBeVisible();

  await expect(page.getByRole('heading', { name: '2. Pagamento' })).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Forma de pagamento' })).toBeVisible();
  await expect(page.getByRole('radio', { name: /PIX/ })).toBeVisible();
  await expect(page.getByRole('radio', { name: /Boleto bancário/ })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Li e concordo/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continuar para a confirmação' })).toBeVisible();

  // Pagamento e frete são demonstração por decisão do produto: o texto precisa
  // estar na tela para a cliente não achar que há cobrança de verdade.
  await expect(page.getByText('Nenhuma forma de pagamento gera cobrança nesta etapa.')).toBeVisible();
  await expect(page.getByText(/Nenhum dado de pagamento é enviado e nenhum cobrança é realizada/)).toBeVisible();
});

test('pré-pedido com dados válidos chega à tela de sucesso', async ({ page }) => {
  // A sacola entra pronta pelo armazenamento local: a cena exercita o checkout
  // inteiro (formulário, envio e confirmação) sem depender de transições de tela.
  await semearCarrinho(page);

  // Consulta de CEP respondida em casa: o teste não depende de rede externa e
  // o preenchimento automático fica determinístico.
  await page.route('https://viacep.com.br/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        cep: ENDERECO.cep,
        logradouro: ENDERECO.logradouro,
        bairro: ENDERECO.bairro,
        localidade: ENDERECO.cidade,
        uf: ENDERECO.estado,
      }),
    })
  );

  await page.goto('/checkout', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1, name: 'Checkout' })).toBeVisible();
  await expect(page.getByText(PRODUTO.nome).first()).toBeVisible();

  await campo(page, /Nome completo/, 'Digite seu nome completo').fill(ENDERECO.nome);
  await campo(page, /Telefone/, '(00) 00000-0000').fill(ENDERECO.telefone);
  await campo(page, /CEP/, '00000-000').fill(ENDERECO.cep);
  await expect(page.getByText(/Endereço preenchido/)).toBeVisible();
  await campo(page, /Número/, 'Nº da casa').fill(ENDERECO.numero);

  await page.getByRole('checkbox', { name: /Li e concordo/ }).check();
  await page.getByRole('button', { name: 'Continuar para a confirmação' }).click();

  // A confirmação é um diálogo (o papel muda conforme a rodada de
  // acessibilidade); o que importa é o texto de sucesso e o código do pedido.
  await expect(page.getByText('Solicitação registrada')).toBeVisible();
  await expect(page.getByText(/Código LOLA-\d{8}-/)).toBeVisible();
  await expect(page.getByText(/Nenhum pagamento foi processado/)).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
