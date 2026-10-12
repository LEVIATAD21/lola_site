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

export interface HoldLine { productId: string; quantity: number; }
interface HoldEntry { productId: string; quantity: number; expiresAt: number; }

export type HoldResult =
  | { ok: true }
  | { ok: false; status: 404 | 409; productId: string; requested: number; available: number; error: string };

/**
 * Persistent inventory for a single Node process. Mutations are synchronous to
 * prevent request handlers in this process from interleaving validation and write.
 * Use a transactional database when deploying multiple application instances.
 */
export class InventoryStore {
  private readonly items: Record<string, StockItem>;
  private readonly filePath?: string;
  /**
   * Pré-reservas de pré-pedidos, só em memória. O arquivo de estoque permanece
   * intacto: `disponivel` devolvido ao cliente já desconta as reservas ativas,
   * então nada se perde e nada é contado em duplicidade ao reiniciar o processo.
   */
  private readonly holds = new Map<string, HoldEntry[]>();

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

  /** Unidades já comprometidas por pré-reservas ativas. */
  heldQuantity(productId: string, now = Date.now()): number {
    let total = 0;
    for (const entries of this.holds.values()) {
      for (const entry of entries) {
        if (entry.productId === productId && entry.expiresAt > now) total += entry.quantity;
      }
    }
    return total;
  }

  /** Unidades realmente vendáveis: estoque gravado menos as pré-reservas ativas. */
  availableQuantity(productId: string, now = Date.now()): number {
    const item = this.items[productId];
    if (!item) return 0;
    return Math.max(0, item.disponivel - this.heldQuantity(productId, now));
  }

  /** Estoque contábil com `disponivel` já líquido das pré-reservas ativas. */
  get(productId: string): StockItem | undefined {
    const item = this.items[productId];
    return item ? { ...item, disponivel: this.availableQuantity(productId) } : undefined;
  }

  list(): StockItem[] {
    return Object.keys(this.items).map((id) => this.get(id)!).filter(Boolean);
  }

  /**
   * Registra uma pré-reserva depois de validar TODAS as linhas de uma vez.
   *
   * VUL-03: antes disto, buildOrderDraft apenas conferia `disponivel` e seguia.
   * Doze pedidos de 5 unidades passavam todos contra 7 em estoque porque nada
   * era comprometido entre a validação e a gravação. Como o handler de pedido é
   * totalmente síncrono, validar tudo e gravar em seguida é atômico.
   */
  placeHold(holdId: string, lines: HoldLine[], expiresAt: number, now = Date.now()): HoldResult {
    this.sweep(now);
    // Acumula por produto durante a validação: sem isso, três linhas de 3
    // unidades passariam separadamente contra 7 em estoque (total 9).
    const pending = new Map<string, number>();
    for (const line of lines) {
      if (!this.items[line.productId]) {
        return {
          ok: false, status: 404, productId: line.productId,
          requested: line.quantity, available: 0,
          error: 'O estoque deste produto ainda não foi configurado.',
        };
      }
      const available = this.availableQuantity(line.productId, now) - (pending.get(line.productId) ?? 0);
      if (available < line.quantity) {
        return {
          ok: false, status: 409, productId: line.productId,
          requested: line.quantity, available: Math.max(0, available),
          error: 'O estoque acabou durante o registro. Atualize a sacola e tente novamente.',
        };
      }
      pending.set(line.productId, (pending.get(line.productId) ?? 0) + line.quantity);
    }
    this.holds.set(holdId, lines.map((line) => ({ ...line, expiresAt })));
    return { ok: true };
  }

  removeHold(holdId: string): boolean {
    return this.holds.delete(holdId);
  }

  /** Devolve ao estoque as pré-reservas vencidas. */
  sweep(now = Date.now()): number {
    let expired = 0;
    for (const [holdId, entries] of [...this.holds]) {
      const live = entries.filter((entry) => entry.expiresAt > now);
      if (live.length === entries.length) continue;
      expired += entries.length - live.length;
      if (live.length) this.holds.set(holdId, live);
      else this.holds.delete(holdId);
    }
    return expired;
  }

  private snapshotHolds(): Map<string, HoldEntry[]> {
    return new Map([...this.holds].map(([holdId, entries]) => [holdId, entries.map((e) => ({ ...e }))]));
  }

  private restoreHolds(snapshot: Map<string, HoldEntry[]>) {
    this.holds.clear();
    for (const [holdId, entries] of snapshot) this.holds.set(holdId, entries);
  }

  /**
   * Uma baixa consome primeiro as unidades pré-reservadas (alocação FIFO) e só
   * depois as livres. Sem isso, o atendente não conseguiria registrar a venda de
   * um pedido em pré-reserva — `disponivel` já estaria descontado.
   */
  private releaseHolds(productId: string, quantity: number, now = Date.now()) {
    let remaining = quantity;
    for (const [holdId, entries] of [...this.holds]) {
      if (remaining <= 0) break;
      for (let index = 0; index < entries.length && remaining > 0;) {
        const entry = entries[index];
        if (entry.productId !== productId || entry.expiresAt <= now) {
          index += 1;
          continue;
        }
        const taken = Math.min(entry.quantity, remaining);
        entry.quantity -= taken;
        remaining -= taken;
        if (entry.quantity === 0) entries.splice(index, 1);
      }
      if (entries.length === 0) this.holds.delete(holdId);
    }
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

    const holdsBefore = this.snapshotHolds();
    this.releaseHolds(productId, quantity);
    if (quantity > current.disponivel) {
      this.restoreHolds(holdsBefore);
      return { ok: false, status: 409, error: 'Estoque insuficiente para esta quantidade.' };
    }

    const previous = { ...current };
    current.disponivel -= quantity;
    current.vendido += quantity;
    try {
      this.persist();
    } catch {
      this.items[productId] = previous;
      this.restoreHolds(holdsBefore);
      return { ok: false, status: 500, error: 'Não foi possível salvar a atualização de estoque.' };
    }
    return { ok: true, stock: { ...current, disponivel: this.availableQuantity(productId) } };
  }
}
