import { describe, it, expect } from 'vitest';
import { parseStoredCart } from '../cartStorage';

const validItem = {
  id: 'brinco-1',
  productId: 'brinco-1',
  name: 'Brinco Argola Lisa',
  price: 49.9,
  image: '/images/x.jpg',
  category: 'Brincos',
  quantity: 2,
};

describe('parseStoredCart', () => {
  it('retorna lista vazia para entrada nula', () => {
    expect(parseStoredCart(null)).toEqual([]);
  });

  it('descarta JSON inválido sem lançar erro', () => {
    expect(parseStoredCart('{not-json')).toEqual([]);
  });

  it('descarta estruturas que não são listas', () => {
    expect(parseStoredCart('{"id":"x"}')).toEqual([]);
    expect(parseStoredCart('"texto"')).toEqual([]);
  });

  it('mantém itens com forma válida', () => {
    const raw = JSON.stringify([validItem]);
    expect(parseStoredCart(raw)).toHaveLength(1);
    expect(parseStoredCart(raw)[0].price).toBe(49.9);
  });

  it('remove itens corrompidos e mantém os válidos', () => {
    const raw = JSON.stringify([
      validItem,
      { id: 'bad', price: 'não é número', quantity: 1 },
      { ...validItem, id: 'qty0', quantity: 0 },
      { ...validItem, id: 'qtyNeg', quantity: -3 },
      { ...validItem, id: 'noName', name: 42 },
      null,
    ]);
    const result = parseStoredCart(raw);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('brinco-1');
  });

  it('descarta o seed antigo de demonstração de 3 itens', () => {
    const raw = JSON.stringify([
      { ...validItem, id: 'cart-1', productId: 'brinco-1' },
      { ...validItem, id: 'cart-2', productId: 'prod-colar-1' },
      { ...validItem, id: 'cart-3', productId: 'prod-pulseira-1' },
    ]);
    expect(parseStoredCart(raw)).toEqual([]);
  });

  it('rejeita preço negativo ou não finito', () => {
    expect(parseStoredCart(JSON.stringify([{ ...validItem, price: -1 }]))).toEqual([]);
    expect(parseStoredCart(JSON.stringify([{ ...validItem, price: Infinity }]))).toEqual([]);
    expect(parseStoredCart(JSON.stringify([{ ...validItem, price: NaN }]))).toEqual([]);
  });
});
