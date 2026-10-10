// Cupons promocionais demonstrativos — fonte única de verdade para sacola e checkout.
// A validação oficial será substituída pela integração com o backend.
export const VALID_COUPONS: Record<string, number> = {
  LOLA10: 10,
  BEMVINDA: 15,
  BRILHO5: 5,
};

export const COUPON_LIST = Object.entries(VALID_COUPONS).map(([code, percentage]) => ({
  code,
  percentage,
}));

export function getCouponPercentage(code: string | null | undefined): number {
  if (!code) return 0;
  return VALID_COUPONS[code.trim().toUpperCase()] ?? 0;
}

export function getCouponDiscount(code: string | null | undefined, subtotal: number): number {
  const pct = getCouponPercentage(code);
  return pct > 0 ? (subtotal * pct) / 100 : 0;
}
