import { describe, it, expect } from 'vitest';
import { getCouponDiscount, getCouponPercentage, VALID_COUPONS } from '../coupons';

describe('cupons de desconto', () => {
  it('reconhece todos os cupons cadastrados', () => {
    for (const code of Object.keys(VALID_COUPONS)) {
      expect(getCouponPercentage(code)).toBe(VALID_COUPONS[code]);
    }
  });

  it('normaliza o código para maiúsculas e remove espaços', () => {
    expect(getCouponPercentage('  lola10 ')).toBe(10);
    expect(getCouponPercentage('bemvinda')).toBe(15);
  });

  it('retorna 0 para códigos desconhecidos ou vazios', () => {
    expect(getCouponPercentage('NAOEXISTE')).toBe(0);
    expect(getCouponPercentage('')).toBe(0);
    expect(getCouponPercentage(null)).toBe(0);
    expect(getCouponPercentage(undefined)).toBe(0);
  });

  it('calcula o desconto proporcional ao subtotal', () => {
    expect(getCouponDiscount('LOLA10', 100)).toBeCloseTo(10);
    expect(getCouponDiscount('BEMVINDA', 200)).toBeCloseTo(30);
    expect(getCouponDiscount('BRILHO5', 50)).toBeCloseTo(2.5);
  });

  it('não aplica desconto com cupom inválido ou subtotal zerado', () => {
    expect(getCouponDiscount('INVALIDO', 100)).toBe(0);
    expect(getCouponDiscount('LOLA10', 0)).toBe(0);
  });
});
