import type { Page } from '@playwright/test';

/**
 * Fixtures de vitrine usados pelas cenas.
 *
 * São valores reais de `src/data/mockData.ts` e `src/data/coupons.ts`, lidos
 * apenas para espelhar aqui. Nenhum produto, cupom ou preço é inventado: se o
 * catálogo mudar de verdade, estes valores mudam junto e a suíte continua
 * apontando para a peça certa.
 */
export const PRODUTO = {
  id: 'brinco-1',
  nome: 'Brinco Argola Lisa',
  categoria: 'Brincos',
  preco: 'R$ 49,90',
};

/** Código que não existe em `COUPON_RULES` — recusa esperada na vitrine. */
export const CUPOM_INVALIDO = 'CUPOMINEXISTENTE';

/** Endereço de referência para o checkout (CEP plausível, dentro da faixa real). */
export const ENDERECO = {
  cep: '01310100',
  logradouro: 'Avenida Paulista',
  bairro: 'Bela Vista',
  cidade: 'São Paulo',
  estado: 'SP',
  numero: '1000',
  telefone: '11987654321',
  nome: 'Maria da Silva',
};

/**
 * Sacola inicial para as cenas de checkout, na forma que o armazenamento local
 * aceita (`parseStoredCart`). Serve a mesma peça e o mesmo preço do catálogo.
 */
export const CARRINHO_SEED = [
  {
    id: PRODUTO.id,
    productId: PRODUTO.id,
    name: PRODUTO.nome,
    price: 49.9,
    image: '/images/product_earrings_1791578709776.jpg',
    category: PRODUTO.categoria,
    quantity: 1,
    variant: 'P (1,5 cm)',
    material: 'Aço inox',
    color: 'Dourado',
    inStock: true,
  },
];

/** Deixa a sacola pronta antes da página abrir, sem depender de transições de tela. */
export function semearCarrinho(page: Page) {
  return page.addInitScript((itens) => {
    window.localStorage.setItem('lola_cart', JSON.stringify(itens));
  }, CARRINHO_SEED);
}
