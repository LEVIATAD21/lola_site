import { describe, it, expect } from 'vitest';
import {
  COUPON_RULES,
  checkCoupon,
  getCouponDiscount,
  getCouponPercentage,
  VALID_COUPONS,
} from '../coupons';

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

describe('regras de cupom no servidor', () => {
  // O percentual continua público na vitrine; a autoridade é checkCoupon, que
  // é quem o servidor chama antes de conceder desconto.
  const dentroDaValidade = new Date('2026-11-15T12:00:00.000Z');

  it('concede o desconto quando todas as regras passam', () => {
    const result = checkCoupon({ code: 'LOLA10', subtotalCents: 10_000, now: dentroDaValidade });
    expect(result).toEqual({ ok: true, percentage: 10 });
  });

  it('recusa código desconhecido', () => {
    const result = checkCoupon({ code: 'HACKEADO', subtotalCents: 100_000, now: dentroDaValidade });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/não é válido/);
  });

  it('normaliza o código como o resto do fluxo', () => {
    const result = checkCoupon({ code: '  lola10  ', subtotalCents: 10_000, now: dentroDaValidade });
    expect(result).toEqual({ ok: true, percentage: 10 });
  });

  it('recusa cupom expirado, mesmo com subtotal cheio', () => {
    const depois = new Date('2027-01-01T12:00:00.000Z');
    for (const code of Object.keys(COUPON_RULES)) {
      const result = checkCoupon({ code, subtotalCents: 1_000_000, now: depois });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/expirou/);
    }
  });

  it('aceita o último dia da validade e recusa o dia seguinte', () => {
    const rule = COUPON_RULES.LOLA10;
    const ultimoDia = new Date(rule.validUntil + 'T23:59:59.000Z');
    const diaSeguinte = new Date(rule.validUntil + 'T23:59:59.999Z');
    expect(checkCoupon({ code: 'LOLA10', subtotalCents: 0, now: ultimoDia }).ok).toBe(true);
    // A meia-noite UTC já é o dia seguinte no servidor.
    expect(checkCoupon({ code: 'LOLA10', subtotalCents: 0, now: new Date(diaSeguinte.getTime() + 1) }).ok).toBe(false);
  });

  it('exige o subtotal mínimo antes de conceder', () => {
    const minimo = COUPON_RULES.BEMVINDA.minSubtotalCents;
    const abaixo = checkCoupon({ code: 'BEMVINDA', subtotalCents: minimo - 1, now: dentroDaValidade });
    expect(abaixo.ok).toBe(false);
    if (!abaixo.ok) expect(abaixo.error).toMatch(/a partir de R\$/);

    // Um centavo abaixo não passa, um centavo acima passa — sem folga.
    expect(checkCoupon({ code: 'BEMVINDA', subtotalCents: minimo, now: dentroDaValidade }).ok).toBe(true);
    expect(checkCoupon({ code: 'BEMVINDA', subtotalCents: 0, now: dentroDaValidade }).ok).toBe(false);
  });

  it('respeita o teto de usos quando a contagem vem do armazenamento', () => {
    const limite = COUPON_RULES.LOLA10.maxUses;
    const umAntes = checkCoupon({ code: 'LOLA10', subtotalCents: 10_000, now: dentroDaValidade, uses: limite - 1 });
    expect(umAntes.ok).toBe(true);

    const noTeto = checkCoupon({ code: 'LOLA10', subtotalCents: 10_000, now: dentroDaValidade, uses: limite });
    expect(noTeto.ok).toBe(false);
    if (!noTeto.ok) expect(noTeto.error).toMatch(/limite de usos/);
  });

  it('não promete teto de usos quando não recebe a contagem', () => {
    // Sem quem conta, a regra fica de fora — mas validade e mínimo continuam.
    expect(checkCoupon({ code: 'LOLA10', subtotalCents: 10_000, now: dentroDaValidade }).ok).toBe(true);
    expect(checkCoupon({ code: 'BEMVINDA', subtotalCents: 100, now: dentroDaValidade }).ok).toBe(false);
  });

  it('toda regra cadastrada é coerente', () => {
    for (const [code, rule] of Object.entries(COUPON_RULES)) {
      expect(rule.percentage, code).toBeGreaterThan(0);
      expect(rule.percentage, code).toBeLessThanOrEqual(100);
      expect(rule.maxUses, code).toBeGreaterThan(0);
      expect(rule.minSubtotalCents, code).toBeGreaterThanOrEqual(0);
      expect(rule.validUntil, code).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // A lista pública de vitrine tem que bater com a regra do servidor.
      expect(VALID_COUPONS[code], code).toBe(rule.percentage);
    }
  });
});
