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

/**
 * Consulta o estoque real via API do servidor.
 * Retorna null em caso de falha de conexão ou erro HTTP — nunca inventa números.
 */
export async function getProductStock(productId: string): Promise<StockResponse | null> {
  try {
    const res = await fetch(`/api/estoque/${productId}`);
    if (res.ok) {
      return await res.json();
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
      return await res.json();
    }
  } catch {
    // Erro de rede capturado
  }

  return {
    resposta: 'No momento, o assistente virtual está indisponível para consulta em tempo real. Por favor, tente novamente mais tarde ou entre em contato pelo canal de atendimento.',
    referencias: [],
  };
}
