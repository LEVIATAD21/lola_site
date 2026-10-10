import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface StockItem {
  productId: string;
  total: number;
  reservado: number;
  vendido: number;
  disponivel: number;
}

export type StockAdjustment =
  | { ok: true; stock: StockItem }
  | { ok: false; status: 400 | 404 | 409 | 500; error: string };

/**
 * Persistent inventory for a single Node process. Mutations are synchronous to
 * prevent request handlers in this process from interleaving validation and write.
 * Use a transactional database when deploying multiple application instances.
 */
export class InventoryStore {
  private readonly items: Record<string, StockItem>;
  private readonly filePath?: string;

  constructor(initial: Record<string, StockItem>, filePath?: string) {
    this.items = Object.fromEntries(
      Object.entries(initial).map(([id, item]) => [id, { ...item }]),
    );
    this.filePath = filePath;
    if (this.filePath && existsSync(this.filePath)) this.loadFromDisk();
    else if (this.filePath) this.persist();
  }

  private isValidItem(id: string, value: unknown): value is StockItem {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const item = value as Record<string, unknown>;
    for (const field of ['total', 'reservado', 'vendido', 'disponivel'] as const) {
      if (!Number.isSafeInteger(item[field]) || (item[field] as number) < 0) return false;
    }
    return item.productId === id &&
      item.total === (item.reservado as number) +
        (item.vendido as number) + (item.disponivel as number);
  }

  private loadFromDisk() {
    try {
      const raw: unknown = JSON.parse(readFileSync(this.filePath!, 'utf8'));
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error('Formato inválido no arquivo de estoque.');
      }
      for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
        if (!(id in this.items)) continue;
        if (!this.isValidItem(id, value)) {
          throw new Error('Registro inválido para o produto ' + id + '.');
        }
        this.items[id] = { ...value };
      }
    } catch (error) {
      throw new Error('Não foi possível carregar o estoque persistido: ' +
        (error instanceof Error ? error.message : 'erro desconhecido'));
    }
  }

  private persist() {
    if (!this.filePath) return;
    mkdirSync(dirname(this.filePath), { recursive: true });
    const temporaryPath = this.filePath + '.' + process.pid + '.tmp';
    writeFileSync(temporaryPath, JSON.stringify(this.items, null, 2) + '\n', { mode: 0o600 });
    renameSync(temporaryPath, this.filePath);
  }

  get(productId: string): StockItem | undefined {
    const item = this.items[productId];
    return item ? { ...item } : undefined;
  }

  list(): StockItem[] {
    return Object.values(this.items).map((item) => ({ ...item }));
  }

  deduct(productId: unknown, quantity: unknown): StockAdjustment {
    if (typeof productId !== 'string' || !productId.trim()) {
      return { ok: false, status: 400, error: 'productId é obrigatório.' };
    }
    if (typeof quantity !== 'number' || !Number.isSafeInteger(quantity) || quantity <= 0) {
      return { ok: false, status: 400, error: 'quantidade deve ser um inteiro positivo.' };
    }
    const current = this.items[productId];
    if (!current) {
      return { ok: false, status: 404, error: 'Produto não encontrado no catálogo.' };
    }
    if (quantity > current.disponivel) {
      return { ok: false, status: 409, error: 'Estoque insuficiente para esta quantidade.' };
    }

    const previous = { ...current };
    current.disponivel -= quantity;
    current.vendido += quantity;
    try {
      this.persist();
    } catch {
      this.items[productId] = previous;
      return { ok: false, status: 500, error: 'Não foi possível salvar a atualização de estoque.' };
    }
    return { ok: true, stock: { ...current } };
  }
}
