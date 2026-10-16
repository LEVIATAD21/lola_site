import { describe, it, expect } from 'vitest';
import { resolveRoute, routePathFor } from '../App';
import { EARRINGS_CATALOG, FEATURED_PRODUCTS } from '../data/mockData';
import type { Product } from '../data/mockData';

const findProductById = (id: string): Product | undefined =>
  [...EARRINGS_CATALOG, ...FEATURED_PRODUCTS].find((p) => p.id === id);

const primeiroProduto = EARRINGS_CATALOG[0];

describe('resolveRoute', () => {
  it('reconhece as rotas fixas', () => {
    expect(resolveRoute('/', findProductById).view).toBe('home');
    expect(resolveRoute('/categoria/brincos', findProductById).view).toBe('category-earrings');
    expect(resolveRoute('/carrinho', findProductById).view).toBe('cart');
    expect(resolveRoute('/checkout', findProductById).view).toBe('checkout');
  });

  it('não depende de maiúsculas no caminho', () => {
    expect(resolveRoute('/CARRINHO', findProductById).view).toBe('cart');
    expect(resolveRoute('/Categoria/Brincos', findProductById).view).toBe('category-earrings');
  });

  it('resolve produto existente com o id correspondente', () => {
    const id = primeiroProduto.id;
    expect(resolveRoute(`/produto/${id}`, findProductById)).toEqual({
      view: 'product-detail',
      productId: id,
    });
  });

  it('cai na home para produto inexistente', () => {
    expect(resolveRoute('/produto/nao-existe', findProductById)).toEqual({ view: 'home' });
    expect(resolveRoute('/produto/', findProductById)).toEqual({ view: 'home' });
  });

  it('cai na home para caminho desconhecido', () => {
    expect(resolveRoute('/ofertas', findProductById)).toEqual({ view: 'home' });
    expect(resolveRoute('/produto/brinco-1/extra', findProductById)).toEqual({ view: 'home' });
  });
});

describe('routePathFor', () => {
  it('fecha o ciclo tela → caminho → tela', () => {
    const fixas = ['home', 'category-earrings', 'cart', 'checkout'] as const;
    for (const view of fixas) {
      const path = routePathFor(view, primeiroProduto);
      expect(resolveRoute(path, findProductById).view).toBe(view);
    }
  });

  it('gera o caminho exato de cada rota', () => {
    expect(routePathFor('home', primeiroProduto)).toBe('/');
    expect(routePathFor('category-earrings', primeiroProduto)).toBe('/categoria/brincos');
    expect(routePathFor('cart', primeiroProduto)).toBe('/carrinho');
    expect(routePathFor('checkout', primeiroProduto)).toBe('/checkout');
    expect(routePathFor('product-detail', primeiroProduto)).toBe(`/produto/${primeiroProduto.id}`);
  });

  it('produto navegado por id volta para a mesma tela', () => {
    const path = routePathFor('product-detail', primeiroProduto);
    expect(resolveRoute(path, findProductById)).toEqual({
      view: 'product-detail',
      productId: primeiroProduto.id,
    });
  });
});
