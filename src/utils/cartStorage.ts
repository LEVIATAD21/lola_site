import { CartItem } from '../types';

/**
 * Limites defensivos para o que o armazenamento local pode conter.
 *
 * O storage NUNCA é fonte comercial (o servidor refaz preço, estoque e
 * desconto), mas ele alimenta `<img src>`, rótulos e contas da vitrine — por
 * isso cada campo é aparado antes de virar estado da aplicação.
 */
export const MAX_STORED_CART_ITEMS = 50;
const MAX_ID_LENGTH = 160;
const MAX_TEXT_LENGTH = 160;
const MAX_IMAGE_LENGTH = 300;
const MAX_PRICE = 1_000_000;

/** Texto curto sem caracteres de controle — nunca devem aparecer num rótulo. */
function safeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  for (let index = 0; index < trimmed.length; index += 1) {
    const code = trimmed.charCodeAt(index);
    // 0x00-0x1F = controles, 0x7F = DEL.
    if (code < 0x20 || code === 0x7f) return null;
  }
  return trimmed;
}

/**
 * Caminho de imagem LOCAL: começa com barra simples, sem `//` (que viraria
 * outra origem), sem barra invertida e sem esquema (`javascript:`, `data:`
 * não passam do requisito da barra inicial). Toda imagem real do catálogo é
 * `/images/...`.
 */
function safeLocalImage(value: unknown): string | null {
  const image = safeText(value, MAX_IMAGE_LENGTH);
  if (!image) return null;
  if (!image.startsWith('/') || image.startsWith('//')) return null;
  if (image.includes('\\')) return null;
  return image;
}

/** Campo opcional de texto: ausente continua ausente; presente precisa ser plausível. */
function optionalText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return safeText(value, MAX_TEXT_LENGTH) ?? undefined;
}

/**
 * Reconstói um item CANÔNICO a partir do JSON cru.
 *
 * A reconstrução é proposital: propriedades extras gravadas no storage
 * (inclusive chaves sujas como `__proto__` ou `constructor`) não são
 * reaproveitadas pelos spreads/merges adiante do fluxo.
 */
function sanitizeCartItem(item: unknown): CartItem | null {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const i = item as Record<string, unknown>;

  const id = safeText(i.id, MAX_ID_LENGTH);
  const productId = safeText(i.productId, MAX_ID_LENGTH);
  const name = safeText(i.name, MAX_TEXT_LENGTH);
  const image = safeLocalImage(i.image);
  const category = safeText(i.category, MAX_TEXT_LENGTH);
  if (!id || !productId || !name || !image || !category) return null;

  if (
    typeof i.price !== 'number' ||
    !Number.isFinite(i.price) ||
    i.price < 0 ||
    i.price > MAX_PRICE
  ) {
    return null;
  }
  if (
    typeof i.quantity !== 'number' ||
    !Number.isInteger(i.quantity) ||
    i.quantity <= 0 ||
    i.quantity > 99
  ) {
    return null;
  }

  const variant = optionalText(i.variant);
  const material = optionalText(i.material);
  const color = optionalText(i.color);
  const inStock = typeof i.inStock === 'boolean' ? i.inStock : undefined;

  return {
    id,
    productId,
    name,
    price: i.price,
    image,
    category,
    quantity: i.quantity,
    ...(variant ? { variant } : {}),
    ...(material ? { material } : {}),
    ...(color ? { color } : {}),
    ...(inStock !== undefined ? { inStock } : {}),
  };
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
    const items: CartItem[] = [];
    for (const candidate of parsed) {
      const item = sanitizeCartItem(candidate);
      if (item) items.push(item);
      if (items.length >= MAX_STORED_CART_ITEMS) break;
    }
    return items;
  } catch {
    return [];
  }
}
