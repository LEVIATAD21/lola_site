import { AppliedCoupon } from '../types';
import { getCouponPercentage, COUPON_CODE_MAX_LENGTH } from '../data/coupons';
import { getStoredShippingOption } from '../data/shippingOptions';
import type { ShippingOption } from '../data/shippingOptions';

/**
 * Leitores do `localStorage` para o fluxo de compra.
 *
 * Regra única: o storage só pode dizer QUAL escolha o cliente fez — nunca
 * QUALIFIQUEMOS o valor dela. Percentual de cupom, nome e preço de frete são
 * sempre reconstruídos a partir das tabelas oficiais do código.
 */

const MAX_FAVORITES = 200;
const MAX_FAVORITE_ID_LENGTH = 120;

/** Lista de ids de favoritos: só strings curtas, no máximo MAX_FAVORITES. */
export function parseStoredFavorites(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const ids: string[] = [];
    for (const candidate of parsed) {
      if (typeof candidate !== 'string') continue;
      const id = candidate.trim();
      if (!id || id.length > MAX_FAVORITE_ID_LENGTH) continue;
      ids.push(id);
      if (ids.length >= MAX_FAVORITES) break;
    }
    return ids;
  } catch {
    return [];
  }
}

/**
 * Cupom persistido: só o CÓDIGO vale; o percentual vem da tabela oficial.
 * Código desconhecido, vazio ou gigante descarta o cupom inteiro.
 */
export function parseStoredCoupon(raw: string | null): AppliedCoupon | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const code = (parsed as Record<string, unknown>).code;
    if (typeof code !== 'string') return null;
    const normalized = code.trim().toUpperCase();
    if (!normalized || normalized.length > COUPON_CODE_MAX_LENGTH) return null;
    const percentage = getCouponPercentage(normalized);
    if (percentage <= 0) return null;
    return { code: normalized, percentage };
  } catch {
    return null;
  }
}

/**
 * Frete persistido: só o ID (pac/sedex/transportadora) é aceito. Nome, prazo
 * e preço são reconstruídos da tabela canônica — um `name` inventado no
 * storage nunca chega ao rótulo do resumo nem aos cálculos.
 */
export function parseStoredShipping(raw: string | null): ShippingOption | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const id = (parsed as Record<string, unknown>).id;
    if (typeof id !== 'string') return null;
    return getStoredShippingOption(id);
  } catch {
    return null;
  }
}
