// Fonte única de verdade para sacola e checkout.
//
// VUL-CUPOM: os três códigos eram público e ilimitado — ido do bundle ao
// navegador, sem validade, sem valor mínimo e sem teto de uso. Qualquer um
// aplicava 15% para sempre. As regras abaixo passam a valer NO SERVIDOR; a
// lista pública continua mostrando só o percentual, porque o desconto de
// campanha é informação de vitrine, não segredo.
//
// A vitrine também conversa com esta tabela no momento em que o cupom é
// aplicado (`checkCoupon` decide) e toda vez que o desconto é calculado —
// o que passa aqui é o que o servidor vai aceitar lá na frente.

export interface CouponRule {
  /** Percentual de desconto, de 1 a 100. */
  percentage: number;
  /** Validade inclusive no formato YYYY-MM-DD. Depois disso o servidor recusa. */
  validUntil: string;
  /** Subtotal mínimo em centavos para o cupom valer. */
  minSubtotalCents: number;
  /** Teto de usos, contado pelos pré-pedidos já gravados. */
  maxUses: number;
}

export const COUPON_RULES: Record<string, CouponRule> = {
  LOLA10: { percentage: 10, validUntil: '2026-12-31', minSubtotalCents: 0, maxUses: 200 },
  BEMVINDA: { percentage: 15, validUntil: '2026-12-31', minSubtotalCents: 15_000, maxUses: 200 },
  BRILHO5: { percentage: 5, validUntil: '2026-12-31', minSubtotalCents: 0, maxUses: 500 },
};

/**
 * Percentual por código, para exibição na vitrine.
 *
 * Mantido como `Record<string, number>` de propósito: a sacola e o modal de
 * cupom consomem este formato. A autoridade, porém, é `checkCoupon`, que é o
 * que o servidor chama.
 */
export const VALID_COUPONS: Record<string, number> = Object.fromEntries(
  Object.entries(COUPON_RULES).map(([code, rule]) => [code, rule.percentage]),
);

export const COUPON_LIST = Object.entries(VALID_COUPONS).map(([code, percentage]) => ({
  code,
  percentage,
}));

/**
 * Cupons que ainda valem ser anunciados na vitrine.
 *
 * A lista `COUPON_LIST` é constante (vem da tabela), o tempo não: depois da
 * validade, anunciar o código promete um desconto que `checkCoupon` já recusa.
 * Percentual aqui é exibição; a regra de quem concede continua sendo `checkCoupon`.
 */
export function getActiveCouponList(now?: Date): Array<{ code: string; percentage: number }> {
  const moment = now ?? new Date();
  return COUPON_LIST.filter(({ code }) => {
    if (!Object.prototype.hasOwnProperty.call(COUPON_RULES, code)) return false;
    return !isCouponRuleExpired(COUPON_RULES[code], moment);
  });
}

export type CouponCheck =
  | { ok: true; percentage: number }
  | { ok: false; error: string };

/**
 * Validade em UTC, inclusive: `new Date('YYYY-MM-DD')` é meia-noite UTC, então
 * o cupom vale até o fim do dia declarado. Função única para a regra não
 * envelhecer em dois lugares diferentes.
 */
function isCouponRuleExpired(rule: CouponRule, now: Date): boolean {
  return now.getTime() > new Date(rule.validUntil + 'T23:59:59.999Z').getTime();
}

/**
 * Decide se um cupom vale para este pedido. É a autoridade: a vitrine mostra o
 * percentual, mas só o servidor concede o desconto.
 *
 * `uses` vem de quem tem os pré-pedidos gravados. Sem essa informação o teto de
 * usos não é cobrado — é melhor não prometer controle a não ter nenhum.
 */
export function checkCoupon(options: {
  code: string;
  subtotalCents: number;
  now?: Date;
  uses?: number;
}): CouponCheck {
  const code = options.code.trim().toUpperCase();
  const rule = Object.prototype.hasOwnProperty.call(COUPON_RULES, code)
    ? COUPON_RULES[code]
    : undefined;

  if (!rule) return { ok: false, error: 'O cupom informado não é válido.' };

  const now = options.now ?? new Date();
  if (isCouponRuleExpired(rule, now)) {
    return { ok: false, error: 'Este cupom expirou.' };
  }

  if (options.subtotalCents < rule.minSubtotalCents) {
    const minimum = (rule.minSubtotalCents / 100).toFixed(2).replace('.', ',');
    return { ok: false, error: `Este cupom vale a partir de R$ ${minimum} em produtos.` };
  }

  if (options.uses !== undefined && options.uses >= rule.maxUses) {
    return { ok: false, error: 'Este cupom já atingiu o limite de usos.' };
  }

  return { ok: true, percentage: rule.percentage };
}

/** Teto de tamanho para um código digitado/recebido de fora. */
export const COUPON_CODE_MAX_LENGTH = 24;

export function getCouponPercentage(code: string | null | undefined): number {
  if (!code || typeof code !== 'string') return 0;
  const normalized = code.trim().toUpperCase();
  if (!normalized || normalized.length > COUPON_CODE_MAX_LENGTH) return 0;
  // Só propriedade PRÓPRIA da tabela: sem este guard, códigos como
  // "constructor" ou "toString" casariam com membros herdados do protótipo de
  // Object (truthy) e aplicariam um "percentual" que não é número, contaminando
  // os totais com NaN. O `.toUpperCase()` acidentalmente cobre os casos comuns,
  // mas a regra explícita não depende desse acidente.
  if (!Object.prototype.hasOwnProperty.call(VALID_COUPONS, normalized)) return 0;
  const percentage = VALID_COUPONS[normalized];
  return typeof percentage === 'number' && Number.isFinite(percentage) && percentage > 0 && percentage <= 100
    ? percentage
    : 0;
}

export function getCouponDiscount(code: string | null | undefined, subtotal: number): number {
  if (typeof code !== 'string') return 0;
  if (!Number.isFinite(subtotal) || subtotal <= 0) return 0;
  // Mesma autoridade do servidor, com o subtotal em mãos: cupom vencido ou
  // abaixo do mínimo não desconta um centavo na vitrine, do jeito que também
  // não desconta no servidor. O teto de usos fica de fora aqui de propósito —
  // a contagem de pré-pedidos mora no servidor, que a cobra no envio.
  const verdict = checkCoupon({ code, subtotalCents: Math.round(subtotal * 100) });
  return verdict.ok ? (subtotal * verdict.percentage) / 100 : 0;
}
