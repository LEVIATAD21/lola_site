export interface StockResponse {
  productId: string;
  total: number;
  reservado: number;
  vendido: number;
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
    if (!(ref.link.startsWith('/') && !ref.link.startsWith('//')) && !ref.link.startsWith('#')) continue;
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

  for (const key of ['total', 'reservado', 'vendido', 'disponivel'] as const) {
    const value = o[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  }

  return {
    productId: o.productId,
    total: o.total as number,
    reservado: o.reservado as number,
    vendido: o.vendido as number,
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
 * Solicita a atualização/baixa de estoque no servidor.
 * Retorna false em caso de falha — nunca simula sucesso nem decrementa localmente sem backend.
 */
export async function deductStock(productId: string, quantity: number): Promise<boolean> {
  try {
    const res = await fetch('/api/estoque/atualizar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, quantidade: quantity }),
    });
    if (res.ok) return true;
  } catch {
    // Falha de rede tratada pelo cliente
  }
  return false;
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
