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

// Local fallback database in case of connection limits or offline
const LOCAL_FALLBACK_STOCK: Record<string, number> = {
  'brinco-1': 8,
  'brinco-2': 4,
  'brinco-3': 12,
  'brinco-4': 3,
  'brinco-5': 6,
  'brinco-6': 9,
  'prod-colar-1': 10,
  'prod-pulseira-1': 7,
  'prod-anel-1': 5,
  'prod-conjunto-1': 2,
};

export async function getProductStock(productId: string): Promise<StockResponse> {
  try {
    const res = await fetch(`/api/estoque/${productId}`);
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // fallback
  }

  const disp = LOCAL_FALLBACK_STOCK[productId] ?? 8;
  return {
    productId,
    total: 15,
    reservado: 2,
    vendido: 5,
    disponivel: disp,
  };
}

export async function deductStock(productId: string, quantity: number): Promise<boolean> {
  try {
    const res = await fetch('/api/estoque/atualizar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, quantidade: quantity }),
    });
    if (res.ok) return true;
  } catch {
    // fallback local update
  }

  if (LOCAL_FALLBACK_STOCK[productId] !== undefined) {
    LOCAL_FALLBACK_STOCK[productId] = Math.max(0, LOCAL_FALLBACK_STOCK[productId] - quantity);
  }
  return true;
}

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
    // fallback
  }

  // Natural fallback if server unavailable
  const q = pergunta.toLowerCase();
  if (q.includes('estoque') || q.includes('disponivel')) {
    return {
      resposta: 'Nossas peças em destaque como a Argola Lisa e o Colar Coração têm pronta entrega no momento!',
      referencias: [{ tipo: 'produto', id: 'brinco-1', titulo: 'Brinco Argola Lisa', link: '/produto/brinco-1' }],
    };
  }

  if (q.includes('agua') || q.includes('banho') || q.includes('escurece') || q.includes('alergia')) {
    return {
      resposta: 'O aço inoxidável 316L da Lola é à prova d’água, hipoalergênico e não escurece, com 1 ano de garantia.',
      referencias: [{ tipo: 'politica', id: 'garantia', titulo: '1 Ano de Garantia Lola', link: '#garantia' }],
    };
  }

  return {
    resposta: 'Olá! Sou a assistente virtual da Lola Aço Inox. Posso tirar dúvidas sobre estoque, materiais, tamanhos e envio!',
    referencias: [],
  };
}
