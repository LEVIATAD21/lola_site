import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface StockItem {
  productId: string;
  total: number;
  reservado: number;
  vendido: number;
  disponivel: number;
}
interface Reservation {
  orderNumber: string;
  expiresAt: string;
  items: Record<string, number>;
}
export type StockAdjustment =
  | { ok: true; stock: StockItem }
  | { ok: false; status: 400 | 404 | 409 | 500; error: string };

/**
 * Persistent inventory and expiring reservations for a single Node process.
 * Mutations are synchronous and persisted together in one atomic file replacement.
 * Use a transactional database/Redis when deploying multiple instances.
 */
export class InventoryStore {
  private readonly items: Record<string, StockItem>;
  private readonly filePath?: string;
  private readonly reservations = new Map<string, Reservation>();

  constructor(initial: Record<string, StockItem>, filePath?: string) {
    this.items = Object.fromEntries(
      Object.entries(initial).map(([id, item]) => [id, { ...item }]),
    );
    this.filePath = filePath;
    if (this.filePath && existsSync(this.filePath)) {
      this.loadFromDisk();
      this.expireReservations();
    } else if (this.filePath) this.persist();
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
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Formato inválido no arquivo de estoque.');
      const object = raw as Record<string, unknown>;
      const rawReservations = object.__reservations;
      for (const [id, value] of Object.entries(object)) {
        if (id === '__reservations' || !(id in this.items)) continue;
        if (!this.isValidItem(id, value)) throw new Error('Registro inválido para o produto ' + id + '.');
        this.items[id] = { ...value };
      }
      if (rawReservations !== undefined) {
        if (!Array.isArray(rawReservations)) throw new Error('Lista de reservas inválida.');
        for (const candidate of rawReservations) {
          if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new Error('Reserva inválida.');
          const reservation = candidate as Partial<Reservation>;
          if (typeof reservation.orderNumber !== 'string' ||
              !/^LOLA-\d{8}-[A-F0-9]{12}$/.test(reservation.orderNumber) ||
              typeof reservation.expiresAt !== 'string' || !Number.isFinite(Date.parse(reservation.expiresAt)) ||
              !reservation.items || typeof reservation.items !== 'object' || Array.isArray(reservation.items)) {
            throw new Error('Reserva persistida inválida.');
          }
          const items: Record<string, number> = {};
          for (const [productId, quantity] of Object.entries(reservation.items)) {
            if (!(productId in this.items) || !Number.isSafeInteger(quantity) || quantity <= 0) throw new Error('Item de reserva inválido.');
            items[productId] = quantity;
          }
          this.reservations.set(reservation.orderNumber, {
            orderNumber: reservation.orderNumber,
            expiresAt: reservation.expiresAt,
            items,
          });
        }
      }
    } catch (error) {
      throw new Error('Não foi possível carregar o estoque persistido: ' +
        (error instanceof Error ? error.message : 'erro desconhecido'));
    }
  }

  private persist() {
    if (!this.filePath) return;
    mkdirSync(dirname(this.filePath), { recursive: true, mode: 0o700 });
    const temporaryPath = this.filePath + '.' + process.pid + '.tmp';
    const payload: Record<string, unknown> = {
      ...this.items,
      __reservations: [...this.reservations.values()],
    };
    writeFileSync(temporaryPath, JSON.stringify(payload, null, 2) + '\n', { mode: 0o600 });
    renameSync(temporaryPath, this.filePath);
  }

  private expireReservations(now = Date.now()) {
    const expired = [...this.reservations.values()].filter((item) => Date.parse(item.expiresAt) <= now);
    if (expired.length === 0) return;
    const previousItems = Object.fromEntries(Object.entries(this.items).map(([id, item]) => [id, { ...item }]));
    const previousReservations = new Map(this.reservations);
    for (const reservation of expired) {
      for (const [productId, quantity] of Object.entries(reservation.items)) {
        const item = this.items[productId];
        if (item && item.reservado >= quantity) {
          item.reservado -= quantity;
          item.disponivel += quantity;
        }
      }
      this.reservations.delete(reservation.orderNumber);
    }
    try { this.persist(); }
    catch {
      for (const [id, item] of Object.entries(previousItems)) this.items[id] = item;
      this.reservations.clear();
      for (const [id, reservation] of previousReservations) this.reservations.set(id, reservation);
      throw new Error('Não foi possível liberar reservas expiradas; estoque permanece bloqueado para segurança.');
    }
  }

  get(productId: string): StockItem | undefined {
    this.expireReservations();
    const item = this.items[productId];
    return item ? { ...item } : undefined;
  }

  list(): StockItem[] {
    this.expireReservations();
    return Object.values(this.items).map((item) => ({ ...item }));
  }

  /** Reserve all requested products together; no partial reservation is left on failure. */
  reserve(orderNumber: string, lines: Array<{ productId: string; quantity: number }>, expiresAt: string): boolean {
    this.expireReservations();
    if (!/^LOLA-\d{8}-[A-F0-9]{12}$/.test(orderNumber) || this.reservations.has(orderNumber)) return false;
    const expires = Date.parse(expiresAt);
    if (!Number.isFinite(expires) || expires <= Date.now() || expires > Date.now() + 60 * 60 * 1000) return false;
    if (!Array.isArray(lines) || lines.length === 0 || lines.length > 30) return false;
    const requested = new Map<string, number>();
    for (const line of lines) {
      if (!line || typeof line.productId !== 'string' || !Number.isSafeInteger(line.quantity) || line.quantity <= 0) return false;
      requested.set(line.productId, (requested.get(line.productId) || 0) + line.quantity);
    }
    for (const [productId, quantity] of requested) {
      const item = this.items[productId];
      if (!item || item.disponivel < quantity) return false;
    }

    const previousItems = Object.fromEntries(Object.entries(this.items).map(([id, item]) => [id, { ...item }]));
    for (const [productId, quantity] of requested) {
      this.items[productId].disponivel -= quantity;
      this.items[productId].reservado += quantity;
    }
    this.reservations.set(orderNumber, {
      orderNumber, expiresAt, items: Object.fromEntries(requested.entries()),
    });
    try { this.persist(); return true; }
    catch {
      for (const [id, item] of Object.entries(previousItems)) this.items[id] = item;
      this.reservations.delete(orderNumber);
      return false;
    }
  }

  /** Release an order's reservation, returning quantities to public availability. */
  releaseReservation(orderNumber: string): boolean {
    this.expireReservations();
    const reservation = this.reservations.get(orderNumber);
    if (!reservation) return true;
    const previousItems = Object.fromEntries(Object.entries(this.items).map(([id, item]) => [id, { ...item }]));
    this.reservations.delete(orderNumber);
    for (const [productId, quantity] of Object.entries(reservation.items)) {
      const item = this.items[productId];
      if (!item || item.reservado < quantity) {
        this.reservations.set(orderNumber, reservation);
        return false;
      }
      item.reservado -= quantity;
      item.disponivel += quantity;
    }
    try { this.persist(); return true; }
    catch {
      for (const [id, item] of Object.entries(previousItems)) this.items[id] = item;
      this.reservations.set(orderNumber, reservation);
      return false;
    }
  }

  /** Moves a reservation into sold stock after a future, verified payment/fulfilment event. */
  confirmReservation(orderNumber: string): boolean {
    this.expireReservations();
    const reservation = this.reservations.get(orderNumber);
    if (!reservation) return false;
    const previousItems = Object.fromEntries(Object.entries(this.items).map(([id, item]) => [id, { ...item }]));
    this.reservations.delete(orderNumber);
    for (const [productId, quantity] of Object.entries(reservation.items)) {
      const item = this.items[productId];
      if (!item || item.reservado < quantity) {
        this.reservations.set(orderNumber, reservation);
        return false;
      }
      item.reservado -= quantity;
      item.vendido += quantity;
    }
    try { this.persist(); return true; }
    catch {
      for (const [id, item] of Object.entries(previousItems)) this.items[id] = item;
      this.reservations.set(orderNumber, reservation);
      return false;
    }
  }

  deduct(productId: unknown, quantity: unknown): StockAdjustment {
    this.expireReservations();
    if (typeof productId !== 'string' || !productId.trim()) return { ok: false, status: 400, error: 'productId é obrigatório.' };
    if (typeof quantity !== 'number' || !Number.isSafeInteger(quantity) || quantity <= 0) {
      return { ok: false, status: 400, error: 'quantidade deve ser um inteiro positivo.' };
    }
    const current = this.items[productId];
    if (!current) return { ok: false, status: 404, error: 'Produto não encontrado no catálogo.' };
    if (quantity > current.disponivel) return { ok: false, status: 409, error: 'Estoque insuficiente para esta quantidade.' };

    const previous = { ...current };
    current.disponivel -= quantity;
    current.vendido += quantity;
    try { this.persist(); }
    catch {
      this.items[productId] = previous;
      return { ok: false, status: 500, error: 'Não foi possível salvar a atualização de estoque.' };
    }
    return { ok: true, stock: { ...current } };
  }
}
