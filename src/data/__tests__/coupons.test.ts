import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COUPON_RULES,
  checkCoupon,
  getActiveCouponList,
  getCouponDiscount,
  getCouponPercentage,
  VALID_COUPONS,
} from '../coupons';

// Relógio fixo: os descontos são conferidos com a validade vigente, e a casa
// não pode depender da data em que a suíte roda para continuar verde.
const DENTRO_DA_VALIDADE = new Date('2026-06-15T12:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(DENTRO_DA_VALIDADE);
});

afterEach(() => {
  vi.useRealTimers();
});

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

describe('aplicação do cupom na vitrine', () => {
  // Modal de cupom e checkout chamam esta mesma autoridade no MOMENTO em que o
  // código é aplicado (e o desconto é recalculado): a recusa aparece com o
  // motivo na tela, sem esperar o envio do pedido devolver 400.

  it('cupom válido: aplicação aceita e desconto concedido', () => {
    const verdict = checkCoupon({ code: 'BEMVINDA', subtotalCents: 15_000, now: DENTRO_DA_VALIDADE });
    expect(verdict).toEqual({ ok: true, percentage: 15 });

    expect(getCouponDiscount('BEMVINDA', 150)).toBeCloseTo(22.5);
    expect(getCouponDiscount('LOLA10', 100)).toBeCloseTo(10);
  });

  it('cupom expirado: recusa com o motivo e a vitrine para de descontar', () => {
    const depois = new Date('2027-01-01T00:00:00.000Z');
    vi.setSystemTime(depois);

    const verdict = checkCoupon({ code: 'LOLA10', subtotalCents: 100_000, now: depois });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.error).toBe('Este cupom expirou.');

    // Mesmo código, mesmo subtotal: nenhum desconto sai da tela depois do fim.
    expect(getCouponDiscount('LOLA10', 100)).toBe(0);
  });

  it('cupom abaixo do mínimo: recusa com o valor mínimo e não desconta', () => {
    const verdict = checkCoupon({ code: 'BEMVINDA', subtotalCents: 14_999, now: DENTRO_DA_VALIDADE });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.error).toBe('Este cupom vale a partir de R$ 150,00 em produtos.');

    expect(getCouponDiscount('BEMVINDA', 149.99)).toBe(0);
    // No mínimo o desconto volta — a mesma fronteira que o servidor cobra.
    expect(getCouponDiscount('BEMVINDA', 150)).toBeCloseTo(22.5);
  });

  it('teto de usos estourado: recusa quando a contagem acompanha o código', () => {
    const limite = COUPON_RULES.LOLA10.maxUses;

    const estourado = checkCoupon({ code: 'LOLA10', subtotalCents: 10_000, now: DENTRO_DA_VALIDADE, uses: limite });
    expect(estourado.ok).toBe(false);
    if (!estourado.ok) expect(estourado.error).toBe('Este cupom já atingiu o limite de usos.');

    const umAntes = checkCoupon({ code: 'LOLA10', subtotalCents: 10_000, now: DENTRO_DA_VALIDADE, uses: limite - 1 });
    expect(umAntes.ok).toBe(true);

    // A vitrine não tem a contagem de pré-pedidos e não finge ter: sem `uses`
    // o teto não é prometido aqui — quem cobra é o servidor, no envio.
    expect(checkCoupon({ code: 'LOLA10', subtotalCents: 10_000, now: DENTRO_DA_VALIDADE }).ok).toBe(true);
  });
});

describe('anúncio de cupons ativos na vitrine', () => {
  it('mostra os cupons dentro da validade', () => {
    const ativos = getActiveCouponList(DENTRO_DA_VALIDADE);
    expect(ativos.map((c) => c.code).sort()).toEqual(['BEMVINDA', 'BRILHO5', 'LOLA10']);
    for (const { percentage, code } of ativos) {
      expect(percentage).toBe(VALID_COUPONS[code]);
    }
  });

  it('não anuncia cupom vencido, nem no dia seguinte à validade', () => {
    const ultimoDia = new Date(COUPON_RULES.LOLA10.validUntil + 'T23:59:59.999Z');
    expect(getActiveCouponList(ultimoDia)).toHaveLength(Object.keys(COUPON_RULES).length);

    const depois = new Date(ultimoDia.getTime() + 1);
    expect(getActiveCouponList(depois)).toEqual([]);
  });
});
