import { CartItem } from '../types';

function isValidCartItem(item: unknown): item is CartItem {
  if (!item || typeof item !== 'object') return false;
  const i = item as Record<string, unknown>;
  return (
    typeof i.id === 'string' &&
    typeof i.productId === 'string' &&
    typeof i.name === 'string' &&
    typeof i.price === 'number' &&
    Number.isFinite(i.price) &&
    i.price >= 0 &&
    typeof i.image === 'string' &&
    typeof i.category === 'string' &&
    typeof i.quantity === 'number' &&
    Number.isInteger(i.quantity) &&
    i.quantity > 0 &&
    i.quantity <= 99
  );
}

/**
 * Limpa apenas o trio fixo de demonstração de versões antigas sem apagar itens reais do usuário.
 */
function isExactOldDemoSeed(parsed: unknown[]): boolean {
  return (
    parsed.length === 3 &&
    parsed.some((i: any) => i?.id === 'cart-1' && i?.productId === 'brinco-1') &&
    parsed.some((i: any) => i?.id === 'cart-2' && i?.productId === 'prod-colar-1') &&
    parsed.some((i: any) => i?.id === 'cart-3' && i?.productId === 'prod-pulseira-1')
  );
}

/**
 * Converte o valor bruto do localStorage em itens válidos de carrinho.
 * Dados corrompidos ou com forma inválida são descartados — nunca confiar no storage como fonte comercial.
 */
export function parseStoredCart(raw: string | null): CartItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    if (isExactOldDemoSeed(parsed)) return [];
    return parsed.filter(isValidCartItem);
  } catch {
    return [];
  }
}
