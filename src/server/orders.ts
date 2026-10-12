import {
  createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID,
} from 'node:crypto';
import {
  chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { VALID_COUPONS } from '../data/coupons';

export type PaymentMethod = 'pix' | 'boleto';
export type ShippingOptionId = 'pac' | 'sedex' | 'transportadora';
export interface OrderCatalogProduct { id: string; name: string; category: string; price: number; }
export interface StockLookup { get(productId: string): { disponivel: number } | undefined; }
export interface DraftOrderLine {
  productId: string; name: string; category: string; quantity: number;
  variant?: string; unitPriceCents: number; lineTotalCents: number;
}
export interface OrderCustomer {
  fullName: string; phone: string; cep: string; street: string; number: string;
  complement: string; neighborhood: string; city: string; state: string;
}
export interface StoredOrderDraft {
  id: string; orderNumber: string; createdAt: string;
  status: 'awaiting_payment_setup'; paymentStatus: 'not_configured';
  paymentMethod: PaymentMethod; shippingOptionId: ShippingOptionId;
  termsAccepted: true; customer: OrderCustomer; items: DraftOrderLine[];
  itemCount: number; subtotalCents: number; discountCents: number;
  shippingCents: number; giftWrapCents: number; totalCents: number;
  couponCode: string | null;
  reservationExpiresAt: string;
}
export interface PublicOrderDraft {
  orderNumber: string; createdAt: string;
  status: 'awaiting_payment_setup'; paymentStatus: 'not_configured';
  paymentMethod: PaymentMethod; shippingOptionId: ShippingOptionId;
  itemCount: number; subtotal: number; discount: number;
  shipping: number; giftWrap: number; total: number;
  reservationExpiresAt: string;
}
export type BuildOrderResult =
  | { ok: true; order: StoredOrderDraft }
  | { ok: false; status: 400 | 404 | 409; error: string };

const STATES = new Set([
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
  'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
]);
const PAYMENT_METHODS = new Set<PaymentMethod>(['pix', 'boleto']);
const SHIPPING_OPTIONS = new Set<ShippingOptionId>(['pac', 'sedex', 'transportadora']);

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  // Customer-provided strings must not contain markup. Renderers must still use normal text escaping.
  if (/[<>]/.test(text)) return null;
  return text.length <= maxLength ? text : null;
}
function requiredText(value: unknown, minLength: number, maxLength: number): string | null {
  const text = cleanText(value, maxLength);
  return text && text.length >= minLength ? text : null;
}
function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

/** Server-authoritative draft calculation. This validates stock but does not reserve it. */
export function buildOrderDraft(
  raw: unknown,
  catalog: OrderCatalogProduct[],
  inventory: StockLookup,
  now = new Date(),
): BuildOrderResult {
  if (!isObject(raw)) return { ok: false, status: 400, error: 'Dados do pré-pedido inválidos.' };
  if (!isObject(raw.customer)) return { ok: false, status: 400, error: 'Preencha os dados de entrega.' };

  const inputCustomer = raw.customer;
  const fullName = requiredText(inputCustomer.fullName, 3, 120);
  const street = requiredText(inputCustomer.street, 5, 180);
  const number = requiredText(inputCustomer.number, 1, 20);
  const neighborhood = requiredText(inputCustomer.neighborhood, 1, 100);
  const city = requiredText(inputCustomer.city, 1, 100);
  const complement = cleanText(inputCustomer.complement ?? '', 120);
  const state = requiredText(inputCustomer.state, 2, 2)?.toUpperCase();
  const phone = typeof inputCustomer.phone === 'string' ? inputCustomer.phone.replace(/\D/g, '') : '';
  const cep = typeof inputCustomer.cep === 'string' ? inputCustomer.cep.replace(/\D/g, '') : '';

  if (!fullName || !street || !number || !neighborhood || !city || complement === null) {
    return { ok: false, status: 400, error: 'Confira nome, logradouro, número e endereço antes de continuar.' };
  }
  if (phone.length < 10 || phone.length > 11) return { ok: false, status: 400, error: 'Informe um telefone válido com DDD.' };
  if (cep.length !== 8) return { ok: false, status: 400, error: 'Informe um CEP com 8 dígitos.' };
  if (!state || !STATES.has(state)) return { ok: false, status: 400, error: 'Selecione um estado brasileiro válido.' };
  if (raw.termsAccepted !== true) return { ok: false, status: 400, error: 'É necessário aceitar os termos para registrar a solicitação.' };
  if (raw.paymentMethod === 'credit_card') {
    return { ok: false, status: 400, error: 'Pagamento por cartão indisponível: a integração segura com o provedor ainda não foi configurada.' };
  }
  if (typeof raw.paymentMethod !== 'string' || !PAYMENT_METHODS.has(raw.paymentMethod as PaymentMethod)) {
    return { ok: false, status: 400, error: 'Selecione uma forma de pré-pedido válida.' };
  }
  if (typeof raw.giftWrap !== 'boolean') return { ok: false, status: 400, error: 'Opção de embalagem de presente inválida.' };

  const shippingValue = raw.shippingOptionId === undefined ? 'pac' : raw.shippingOptionId;
  if (typeof shippingValue !== 'string' || !SHIPPING_OPTIONS.has(shippingValue as ShippingOptionId)) {
    return { ok: false, status: 400, error: 'Modalidade de frete inválida.' };
  }
  const shippingOptionId = shippingValue as ShippingOptionId;

  let couponCode: string | null = null;
  let couponPercentage = 0;
  if (raw.couponCode !== undefined && raw.couponCode !== null && raw.couponCode !== '') {
    if (typeof raw.couponCode !== 'string' || raw.couponCode.length > 40) return { ok: false, status: 400, error: 'Cupom inválido.' };
    const normalized = raw.couponCode.trim().toUpperCase();
    if (!normalized || !Object.prototype.hasOwnProperty.call(VALID_COUPONS, normalized)) {
      return { ok: false, status: 400, error: 'O cupom informado não é válido.' };
    }
    couponCode = normalized;
    couponPercentage = VALID_COUPONS[normalized];
  }

  if (!Array.isArray(raw.items) || raw.items.length < 1 || raw.items.length > 30) {
    return { ok: false, status: 400, error: 'A solicitação deve conter de 1 a 30 linhas de produto.' };
  }
  const products = new Map(catalog.map((product) => [product.id, product]));
  const requested = new Map<string, number>();
  const lines: DraftOrderLine[] = [];

  for (const candidate of raw.items) {
    if (!isObject(candidate) || typeof candidate.productId !== 'string' || !candidate.productId.trim()) {
      return { ok: false, status: 400, error: 'Um dos itens da solicitação é inválido.' };
    }
    if (!Number.isSafeInteger(candidate.quantity) || (candidate.quantity as number) < 1 || (candidate.quantity as number) > 99) {
      return { ok: false, status: 400, error: 'A quantidade de cada item deve ser um inteiro entre 1 e 99.' };
    }
    const product = products.get(candidate.productId);
    if (!product) return { ok: false, status: 404, error: 'Um dos produtos não existe no catálogo atual.' };
    const variant = candidate.variant === undefined ? undefined : cleanText(candidate.variant, 100);
    if (candidate.variant !== undefined && variant === null) {
      return { ok: false, status: 400, error: 'Uma das variações do produto é inválida.' };
    }
    requested.set(product.id, (requested.get(product.id) ?? 0) + (candidate.quantity as number));
    const unitPriceCents = Math.round(product.price * 100);
    lines.push({
      productId: product.id, name: product.name, category: product.category,
      quantity: candidate.quantity as number,
      ...(variant ? { variant } : {}),
      unitPriceCents, lineTotalCents: unitPriceCents * (candidate.quantity as number),
    });
  }

  for (const [productId, quantity] of requested) {
    const available = inventory.get(productId)?.disponivel;
    if (available === undefined) return { ok: false, status: 409, error: 'O estoque deste produto ainda não foi configurado.' };
    if (available < quantity) {
      const product = products.get(productId);
      return {
        ok: false, status: 409,
        error: 'Estoque insuficiente para ' + (product?.name ?? 'um produto') + '. Revise a quantidade na sacola.',
      };
    }
  }

  const subtotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
  const discountCents = Math.round(subtotalCents * couponPercentage / 100);
  const freeShipping = subtotalCents >= 15000;
  let shippingCents: number;
  switch (shippingOptionId) {
    case 'pac': shippingCents = freeShipping ? 0 : 1990; break;
    case 'sedex': shippingCents = freeShipping ? 1290 : 2890; break;
    case 'transportadora': shippingCents = freeShipping ? 0 : 2250; break;
  }
  const giftWrapCents = raw.giftWrap ? 990 : 0;
  const totalCents = Math.max(0, subtotalCents - discountCents + shippingCents + giftWrapCents);
  const id = randomUUID();
  const createdAt = now.toISOString();

  return {
    ok: true,
    order: {
      id,
      orderNumber: 'LOLA-' + createdAt.slice(0, 10).replace(/-/g, '') + '-' + id.replace(/-/g, '').slice(0, 12).toUpperCase(),
      createdAt,
      reservationExpiresAt: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
      status: 'awaiting_payment_setup',
      paymentStatus: 'not_configured',
      paymentMethod: raw.paymentMethod as PaymentMethod,
      shippingOptionId,
      termsAccepted: true,
      customer: {
        fullName, phone, cep, street, number, complement, neighborhood, city, state,
      },
      items: lines,
      itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
      subtotalCents, discountCents, shippingCents, giftWrapCents, totalCents, couponCode,
    },
  };
}

export interface AdminOrderView {
  orderNumber: string;
  createdAt: string;
  status: 'awaiting_payment_setup';
  paymentStatus: 'not_configured';
  paymentMethod: PaymentMethod;
  shippingOptionId: ShippingOptionId;
  customer: OrderCustomer;
  items: DraftOrderLine[];
  itemCount: number;
  subtotal: number;
  discount: number;
  shipping: number;
  giftWrap: number;
  total: number;
  couponCode: string | null;
}

export function toAdminOrder(order: StoredOrderDraft): AdminOrderView {
  return {
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    reservationExpiresAt: order.reservationExpiresAt,
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    shippingOptionId: order.shippingOptionId,
    customer: { ...order.customer },
    items: order.items.map((item) => ({ ...item })),
    itemCount: order.itemCount,
    subtotal: order.subtotalCents / 100,
    discount: order.discountCents / 100,
    shipping: order.shippingCents / 100,
    giftWrap: order.giftWrapCents / 100,
    total: order.totalCents / 100,
    couponCode: order.couponCode,
  };
}

export function toPublicOrder(order: StoredOrderDraft): PublicOrderDraft {
  return {
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    reservationExpiresAt: order.reservationExpiresAt,
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    shippingOptionId: order.shippingOptionId,
    itemCount: order.itemCount,
    subtotal: order.subtotalCents / 100,
    discount: order.discountCents / 100,
    shipping: order.shippingCents / 100,
    giftWrap: order.giftWrapCents / 100,
    total: order.totalCents / 100,
  };
}

interface EncryptedEnvelope { version: 1; iv: string; tag: string; ciphertext: string; }

/**
 * Encrypted order store for one Node process. Archives older records so the active
 * file can remain bounded. Production must use a stable environment-managed key.
 */
export class EncryptedOrderStore {
  private readonly filePath: string;
  private readonly archivePath: string;
  private readonly key?: Buffer;
  private records: StoredOrderDraft[] = [];
  private archivedCount = 0;
  readonly ready: boolean;
  readonly unavailableReason: string | null;

  constructor(directory: string, keyHex?: string, production = false) {
    this.filePath = join(directory, 'orders.enc.json');
    this.archivePath = join(directory, 'orders.archive.enc.json');
    let key: Buffer | undefined;
    let reason: string | null = null;

    if (keyHex) {
      if (!/^[a-f\d]{64}$/i.test(keyHex)) reason = 'LOLA_ORDERS_ENCRYPTION_KEY deve conter exatamente 64 caracteres hexadecimais.';
      else key = Buffer.from(keyHex, 'hex');
    } else if (production) {
      reason = 'Configure LOLA_ORDERS_ENCRYPTION_KEY (32 bytes em hexadecimal) para habilitar pré-pedidos em produção.';
    } else {
      // Keep the local development key outside the data directory, so backing up
      // or exposing encrypted records does not automatically expose the key.
      mkdirSync(join(homedir(), '.config', 'lola-site', 'secrets'), { recursive: true, mode: 0o700 });
      const keyName = createHash('sha256').update(resolve(directory)).digest('hex').slice(0, 24);
      const keyPath = join(homedir(), '.config', 'lola-site', 'secrets', keyName + '.orders.key');
      if (existsSync(keyPath)) {
        const text = readFileSync(keyPath, 'utf8').trim();
        if (/^[a-f\d]{64}$/i.test(text)) key = Buffer.from(text, 'hex');
        else reason = 'A chave local de pedidos está inválida.';
      } else {
        const text = randomBytes(32).toString('hex');
        try {
          writeFileSync(keyPath, text + '\n', { mode: 0o600, flag: 'wx' });
          key = Buffer.from(text, 'hex');
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (code === 'EEXIST') {
            const existing = readFileSync(keyPath, 'utf8').trim();
            if (/^[a-f\d]{64}$/i.test(existing)) key = Buffer.from(existing, 'hex');
            else reason = 'A chave local de pedidos está inválida.';
          } else reason = 'Não foi possível criar uma chave local para criptografia.';
        }
      }
      if (existsSync(keyPath)) chmodSync(keyPath, 0o600);
    }

    this.key = key;
    if (key && !reason) {
      try {
        mkdirSync(directory, { recursive: true, mode: 0o700 });
        if (existsSync(this.filePath)) this.records = this.readEncryptedArray(this.filePath);
        if (existsSync(this.archivePath)) this.archivedCount = this.readEncryptedArray(this.archivePath).length;
      } catch {
        reason = 'Armazenamento cifrado de pré-pedidos ilegível; confira a chave e restaure um backup válido. O servidor continuará no ar em modo seguro.';
        this.records = [];
        this.archivedCount = 0;
      }
    }
    this.unavailableReason = reason;
    this.ready = Boolean(key) && !reason;
  }

  private readEncryptedArray(filePath: string): StoredOrderDraft[] {
    if (!this.key) throw new Error('Chave de criptografia indisponível.');
    const envelope = JSON.parse(readFileSync(filePath, 'utf8')) as EncryptedEnvelope;
    if (envelope.version !== 1 || typeof envelope.iv !== 'string' ||
        typeof envelope.tag !== 'string' || typeof envelope.ciphertext !== 'string') {
      throw new Error('Envelope cifrado de pedidos inválido.');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(envelope.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'hex'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, 'hex')), decipher.final(),
    ]).toString('utf8');
    const parsed: unknown = JSON.parse(plaintext);
    if (!Array.isArray(parsed)) throw new Error('Arquivo cifrado de pedidos inválido.');
    return parsed as StoredOrderDraft[];
  }

  private persistEncryptedArray(filePath: string, records: StoredOrderDraft[]) {
    if (!this.key) throw new Error('Criptografia de pedidos indisponível.');
    mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 });
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(records), 'utf8')), cipher.final()]);
    const envelope: EncryptedEnvelope = {
      version: 1, iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'),
      ciphertext: encrypted.toString('hex'),
    };
    const temp = filePath + '.' + process.pid + '.tmp';
    writeFileSync(temp, JSON.stringify(envelope) + '\n', { mode: 0o600 });
    chmodSync(temp, 0o600);
    renameSync(temp, filePath);
  }

  private persist() {
    this.persistEncryptedArray(this.filePath, this.records);
  }

  private archiveOldestBatch(): boolean {
    if (this.records.length < 10_000) return true;
    let oldArchive: StoredOrderDraft[];
    try { oldArchive = existsSync(this.archivePath) ? this.readEncryptedArray(this.archivePath) : []; }
    catch { return false; }
    const count = Math.max(1_000, this.records.length - 9_000);
    const batch = this.records.slice(0, count);
    const oldRecords = this.records;
    const merged = new Map<string, StoredOrderDraft>();
    for (const record of oldArchive) merged.set(record.orderNumber, record);
    for (const record of batch) merged.set(record.orderNumber, record);
    try {
      this.persistEncryptedArray(this.archivePath, [...merged.values()]);
      this.records = oldRecords.slice(count);
      try { this.persist(); }
      catch {
        this.records = oldRecords;
        this.persistEncryptedArray(this.archivePath, oldArchive);
        return false;
      }
      this.archivedCount = merged.size;
      return true;
    } catch {
      this.records = oldRecords;
      return false;
    }
  }

  save(order: StoredOrderDraft): boolean {
    if (!this.ready) return false;
    if (this.records.length >= 10_000 && !this.archiveOldestBatch()) return false;
    this.records.push(order);
    try { this.persist(); return true; }
    catch { this.records.pop(); return false; }
  }

  hasOrder(orderNumber: string): boolean {
    if (this.records.some((record) => record.orderNumber === orderNumber)) return true;
    if (!this.ready || !existsSync(this.archivePath)) return false;
    try { return this.readEncryptedArray(this.archivePath).some((record) => record.orderNumber === orderNumber); }
    catch { return false; }
  }

  findByOrderNumber(orderNumber: string): StoredOrderDraft | undefined {
    const active = this.records.find((item) => item.orderNumber === orderNumber);
    const record = active || (this.ready && existsSync(this.archivePath)
      ? this.readEncryptedArray(this.archivePath).find((item) => item.orderNumber === orderNumber)
      : undefined);
    return record ? JSON.parse(JSON.stringify(record)) as StoredOrderDraft : undefined;
  }

  listRecent(limit = 50): StoredOrderDraft[] {
    const boundedLimit = Number.isSafeInteger(limit) ? Math.min(Math.max(limit, 1), 100) : 50;
    return this.records.slice(-boundedLimit).reverse().map(
      (item) => JSON.parse(JSON.stringify(item)) as StoredOrderDraft,
    );
  }

  get size(): number { return this.records.length + this.archivedCount; }
}
