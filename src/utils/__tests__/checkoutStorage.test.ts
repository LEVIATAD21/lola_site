import { describe, it, expect } from 'vitest';
import { parseStoredCoupon, parseStoredFavorites, parseStoredShipping } from '../checkoutStorage';

describe('parseStoredFavorites', () => {
  it('retorna lista vazia para entrada nula ou JSON inválido', () => {
    expect(parseStoredFavorites(null)).toEqual([]);
    expect(parseStoredFavorites('{oops')).toEqual([]);
    expect(parseStoredFavorites('{"a":1}')).toEqual([]);
  });

  it('mantém apenas ids string não vazios', () => {
    const raw = JSON.stringify(['brinco-1', 42, null, {}, '  ', 'brinco-2']);
    expect(parseStoredFavorites(raw)).toEqual(['brinco-1', 'brinco-2']);
  });

  it('descarta strings acima do limite e corta a lista no teto', () => {
    const gigante = 'a'.repeat(500);
    const lista = [gigante, 'ok'];
    for (let i = 0; i < 500; i += 1) lista.push(`item-${i}`);
    const result = parseStoredFavorites(JSON.stringify(lista));
    expect(result).not.toContain(gigante);
    expect(result.length).toBeLessThanOrEqual(200);
    expect(result[0]).toBe('ok');
  });
});

describe('parseStoredCoupon', () => {
  it('retorna null para ausência, JSON inválido ou formas erradas', () => {
    expect(parseStoredCoupon(null)).toBeNull();
    expect(parseStoredCoupon('no-json')).toBeNull();
    expect(parseStoredCoupon('"LOLA10"')).toBeNull();
    expect(parseStoredCoupon('[]')).toBeNull();
    expect(parseStoredCoupon('{"code":10}')).toBeNull();
  });

  it('ignora o percentual gravado e usa o da tabela oficial', () => {
    // PoC: percentual inflado no storage não pode virar desconto.
    const raw = JSON.stringify({ code: 'LOLA10', percentage: 1e9 });
    expect(parseStoredCoupon(raw)).toEqual({ code: 'LOLA10', percentage: 10 });
  });

  it('descarta códigos desconhecidos, vazios ou longos demais', () => {
    expect(parseStoredCoupon(JSON.stringify({ code: 'HACKEADO' }))).toBeNull();
    expect(parseStoredCoupon(JSON.stringify({ code: '   ' }))).toBeNull();
    expect(parseStoredCoupon(JSON.stringify({ code: 'LOLA10'.padEnd(200, 'X') }))).toBeNull();
    // Propriedades herdadas de Object.prototype não são cupons.
    expect(parseStoredCoupon(JSON.stringify({ code: 'constructor' }))).toBeNull();
    expect(parseStoredCoupon(JSON.stringify({ code: 'toString' }))).toBeNull();
  });

  it('normaliza o código para maiúsculas', () => {
    expect(parseStoredCoupon(JSON.stringify({ code: ' lola10 ' }))).toEqual({
      code: 'LOLA10',
      percentage: 10,
    });
  });
});

describe('parseStoredShipping', () => {
  it('retorna null para ausência, JSON inválido ou id desconhecido', () => {
    expect(parseStoredShipping(null)).toBeNull();
    expect(parseStoredShipping('no-json')).toBeNull();
    expect(parseStoredShipping('{"id":"paypal"}')).toBeNull();
    expect(parseStoredShipping('{"id":"constructor"}')).toBeNull();
  });

  it('aceita ids canônicos e reconstrói nome/prazo/preço da tabela', () => {
    const raw = JSON.stringify({
      id: 'sedex',
      name: 'Frete GRÁTIS HACKED',
      time: 'ontem',
      price: -100,
    });
    expect(parseStoredShipping(raw)).toEqual({
      id: 'sedex',
      name: 'SEDEX Expresso',
      time: '1 a 3 dias úteis',
      price: 28.9,
    });
  });
});
