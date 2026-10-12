export interface StockResponse {
  productId: string;
  disponivel: number;
}

export interface AIRef {
  tipo: 'produto' | 'FAQ' | 'politica';
  id: string;
  titulo: string;
  link: string;
}

export interface AIResponse {
  resposta: string;
  referencias: AIRef[];
}

/**
 * Só aceita destinos internos da própria loja.
 *
 * O padrão WHATWG de URL normaliza barra invertida em barra nos esquemas
 * especiais, então um caminho iniciado com barra invertida + host resolve para
 * o domínio do atacante — um open redirect disfarçado de link interno (VUL-07).
 * Por isso a regra textual (sem barra invertida, sem caracteres de controle,
 * sem espaço) vem ANTES da conferência de origem, e o caminho precisa continuar
 * na mesma origem depois de resolvido pelo navegador.
 */
function hasUnsafeLinkChar(link: string): boolean {
  for (let index = 0; index < link.length; index += 1) {
    const code = link.charCodeAt(index);
    // 0x00-0x20 = controles e espaço; 0x7f = DEL; 0x5c = barra invertida.
    if (code <= 0x20 || code === 0x7f || code === 0x5c) return true;
  }
  return false;
}

function isInternalReferenceLink(link: string): boolean {
  if (!link || link.length > 300) return false;
  if (hasUnsafeLinkChar(link)) return false;
  // Fragmento interno (#garantia, #frete): nunca sai do documento.
  if (link.startsWith('#')) return true;
  // "barra barra host" é relativo a outra origem; esquema de script nem chega aqui.
  if (!link.startsWith('/') || link.startsWith('//')) return false;
  try {
    const base = typeof location !== 'undefined' && location.origin
      ? location.origin
      : 'https://lola.local';
    return new URL(link, base).origin === base;
  } catch {
    return false;
  }
}

/** Accept only a well-formed assistant response with safe internal reference links. */
export function parseAIResponse(json: unknown): AIResponse | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const value = json as Record<string, unknown>;
  if (typeof value.resposta !== 'string' || !value.resposta.trim() || value.resposta.length > 10000) return null;
  if (!Array.isArray(value.referencias)) return null;
  const referencias: AIRef[] = [];
  for (const candidate of value.referencias.slice(0, 20)) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
    const ref = candidate as Record<string, unknown>;
    if (ref.tipo !== 'produto' && ref.tipo !== 'FAQ' && ref.tipo !== 'politica') continue;
    if (typeof ref.id !== 'string' || typeof ref.titulo !== 'string' || typeof ref.link !== 'string') continue;
    if (ref.id.length > 120 || ref.titulo.length > 200 || ref.link.length > 300) continue;
    if (!isInternalReferenceLink(ref.link)) continue;
    referencias.push({ tipo: ref.tipo, id: ref.id, titulo: ref.titulo, link: ref.link });
  }
  return { resposta: value.resposta, referencias };
}

/**
 * Valida estritamente o payload de estoque vindo do servidor.
 * Rejeita corpos ausentes, malformados ou com tipos inválidos — nunca infere disponibilidade.
 */
export function parseStockPayload(json: unknown, expectedId?: string): StockResponse | null {
  if (!json || typeof json !== 'object') return null;
  const o = json as Record<string, unknown>;

  if (typeof o.productId !== 'string' || !o.productId) return null;
  if (expectedId && o.productId !== expectedId) return null;

  // Only public availability belongs in the storefront response. Administrative counters are intentionally omitted.
  if (!Number.isSafeInteger(o.disponivel) || (o.disponivel as number) < 0) return null;

  return {
    productId: o.productId,
    disponivel: o.disponivel as number,
  };
}

/**
 * Consulta o estoque real via API do servidor.
 * Retorna null em caso de falha de conexão, erro HTTP ou payload inválido — nunca inventa números.
 */
export async function getProductStock(productId: string): Promise<StockResponse | null> {
  try {
    const res = await fetch(`/api/estoque/${encodeURIComponent(productId)}`);
    if (res.ok) {
      const payload = await res.json();
      return parseStockPayload(payload, productId);
    }
  } catch {
    // Falha de rede tratada pelo cliente
  }
  return null;
}

/**
 * Consulta o assistente virtual.
 * Se a API estiver indisponível ou falhar, retorna mensagem honesta e acolhedora sem inventar estoque ou garantias.
 */
export async function consultAI(
  pergunta: string,
  contexto?: { produtoId?: string; carrinho?: any[]; sessaoCliente?: string }
): Promise<AIResponse> {
  try {
    const res = await fetch('/api/ai/consulta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pergunta, contexto }),
    });

    if (res.ok) {
      const parsed = parseAIResponse(await res.json());
      if (parsed) return parsed;
    }
  } catch {
    // Erro de rede capturado
  }

  return {
    resposta: 'No momento, o assistente virtual está indisponível para consulta em tempo real. Por favor, tente novamente mais tarde ou entre em contato pelo canal de atendimento.',
    referencias: [],
  };
}


export type CheckoutPaymentMethod = 'pix' | 'boleto';
export interface DraftOrderRequest {
  customer: {
    fullName: string; phone: string; cep: string; street: string; number: string;
    complement: string; neighborhood: string; city: string; state: string;
  };
  items: Array<{ productId: string; quantity: number; variant?: string }>;
  paymentMethod: CheckoutPaymentMethod;
  couponCode?: string;
  shippingOptionId: 'pac' | 'sedex' | 'transportadora';
  giftWrap: boolean;
  termsAccepted: boolean;
}
export interface DraftOrderConfirmation {
  orderNumber: string;
  createdAt: string;
  status: 'awaiting_payment_setup';
  paymentStatus: 'not_configured';
  paymentMethod: CheckoutPaymentMethod;
  shippingOptionId: 'pac' | 'sedex' | 'transportadora';
  itemCount: number;
  subtotal: number;
  discount: number;
  shipping: number;
  giftWrap: number;
  total: number;
}

/** Validate the public response before presenting an order reference or totals. */
export function parseDraftOrderConfirmation(json: unknown): DraftOrderConfirmation | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const root = json as Record<string, unknown>;
  if (root.success !== true || !root.order || typeof root.order !== 'object' || Array.isArray(root.order)) return null;
  const order = root.order as Record<string, unknown>;
  if (typeof order.orderNumber !== 'string' || !/^LOLA-\d{8}-[A-F0-9]{12}$/.test(order.orderNumber)) return null;
  if (typeof order.createdAt !== 'string' || !Number.isFinite(Date.parse(order.createdAt))) return null;
  if (order.status !== 'awaiting_payment_setup' || order.paymentStatus !== 'not_configured') return null;
  if (order.paymentMethod !== 'pix' && order.paymentMethod !== 'boleto') return null;
  if (order.shippingOptionId !== 'pac' && order.shippingOptionId !== 'sedex' && order.shippingOptionId !== 'transportadora') return null;
  if (!Number.isSafeInteger(order.itemCount) || (order.itemCount as number) < 1) return null;
  for (const field of ['subtotal', 'discount', 'shipping', 'giftWrap', 'total'] as const) {
    if (typeof order[field] !== 'number' || !Number.isFinite(order[field]) || (order[field] as number) < 0) return null;
  }
  return {
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    status: 'awaiting_payment_setup',
    paymentStatus: 'not_configured',
    paymentMethod: order.paymentMethod,
    shippingOptionId: order.shippingOptionId,
    itemCount: order.itemCount as number,
    subtotal: order.subtotal as number,
    discount: order.discount as number,
    shipping: order.shipping as number,
    giftWrap: order.giftWrap as number,
    total: order.total as number,
  };
}

/**
 * Registers an encrypted pre-order request. Card number, CVV and expiry are
 * intentionally absent from this payload and are never transmitted.
 */
export async function createOrderDraft(
  request: DraftOrderRequest,
): Promise<{ ok: true; order: DraftOrderConfirmation } | { ok: false; error: string }> {
  try {
    const response = await fetch('/api/pedidos/rascunho', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    let payload: unknown = null;
    try { payload = await response.json(); } catch { /* handled as invalid response */ }
    if (!response.ok) {
      const value = payload as { error?: unknown } | null;
      return {
        ok: false,
        error: value && typeof value.error === 'string'
          ? value.error
          : 'Não foi possível registrar a solicitação. Tente novamente.',
      };
    }
    const order = parseDraftOrderConfirmation(payload);
    if (!order) return { ok: false, error: 'O servidor retornou uma confirmação inválida.' };
    return { ok: true, order };
  } catch {
    return { ok: false, error: 'Não foi possível conectar ao servidor. Verifique a conexão e tente novamente.' };
  }
}
