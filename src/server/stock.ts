import type { StockItem } from './inventory';
import { CATALOG_INFO } from './catalog';

/**
 * Estoque inicial de referência.
 *
 * Existe uma função e não um objeto exportado de propósito: os dois processos do
 * modelo dividido (site público e servidor de dados) carregam o módulo
 * separadamente, e um objeto compartilhado daria a impressão de que mudanças de
 * um atravessam o módulo até o outro. Cada processo monta o seu.
 */
export function createInitialStock(): Record<string, StockItem> {
  const stock: Record<string, StockItem> = {
    'brinco-1': { productId: 'brinco-1', total: 15, reservado: 2, vendido: 5, disponivel: 8 },
    'brinco-2': { productId: 'brinco-2', total: 10, reservado: 1, vendido: 5, disponivel: 4 },
    'brinco-3': { productId: 'brinco-3', total: 20, reservado: 3, vendido: 5, disponivel: 12 },
    'brinco-4': { productId: 'brinco-4', total: 8, reservado: 2, vendido: 3, disponivel: 3 },
    'brinco-5': { productId: 'brinco-5', total: 14, reservado: 0, vendido: 8, disponivel: 6 },
    'brinco-6': { productId: 'brinco-6', total: 12, reservado: 1, vendido: 2, disponivel: 9 },
    'prod-colar-1': { productId: 'prod-colar-1', total: 18, reservado: 2, vendido: 6, disponivel: 10 },
    'prod-pulseira-1': { productId: 'prod-pulseira-1', total: 15, reservado: 1, vendido: 7, disponivel: 7 },
    'prod-anel-1': { productId: 'prod-anel-1', total: 10, reservado: 2, vendido: 3, disponivel: 5 },
    'prod-conjunto-1': { productId: 'prod-conjunto-1', total: 6, reservado: 1, vendido: 3, disponivel: 2 },
  };

  // IDs do catálogo sem estoque cadastrado começam indisponíveis.
  for (const product of CATALOG_INFO) {
    if (!stock[product.id]) {
      stock[product.id] = { productId: product.id, total: 0, reservado: 0, vendido: 0, disponivel: 0 };
    }
  }

  return stock;
}
