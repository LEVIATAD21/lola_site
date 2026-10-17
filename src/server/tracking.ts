import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { log } from './logger';

export type InternalShippingStatus = 'preparing' | 'posted' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception';
export interface TrackingEvent {
  id: string;
  status: InternalShippingStatus;
  title: string;
  description: string;
  occurredAt: string;
  source: 'store' | 'carrier';
  location?: string;
}
interface TrackingRecord {
  orderNumber: string;
  tokenHash: string;
  carrierCode: string | null;
  status: InternalShippingStatus;
  events: TrackingEvent[];
  createdAt: string;
  updatedAt: string;
}
export interface PublicTracking {
  orderNumber: string;
  carrierCode: string | null;
  status: InternalShippingStatus;
  events: TrackingEvent[];
  updatedAt: string;
}
const STATUSES = new Set<InternalShippingStatus>(['preparing','posted','in_transit','out_for_delivery','delivered','exception']);
const TITLES: Record<InternalShippingStatus,string> = {
  preparing: 'Pedido sendo preparado', posted: 'Pedido postado nos Correios',
  in_transit: 'Pedido em trânsito', out_for_delivery: 'Saiu para entrega',
  delivered: 'Pedido entregue', exception: 'Ocorrência na entrega',
};
/** Texto de logística público: sem controles e sem `<`/`>` — nada de marcação entra no rastreio (RT-E-05). */
const clean = (value: unknown, max: number) => typeof value === 'string'
  ? value.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';

/** Encrypted, single-process persistence for shipment tracking. Requires a stable 32-byte key in production. */
export class TrackingStore {
  private records: TrackingRecord[] = [];
  private readonly file: string;
  private readonly key?: Buffer;
  readonly ready: boolean;
  constructor(directory: string, keyHex?: string, production = false) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.file = join(directory, 'tracking.enc.json');
    let key: Buffer | undefined;
    if (keyHex && /^[a-f\d]{64}$/i.test(keyHex)) key = Buffer.from(keyHex, 'hex');
    else if (!production) {
      const keyFile = join(directory, 'tracking.key');
      if (existsSync(keyFile)) {
        const saved = readFileSync(keyFile, 'utf8').trim();
        if (/^[a-f\d]{64}$/i.test(saved)) key = Buffer.from(saved, 'hex');
      } else {
        const saved = randomBytes(32).toString('hex');
        try { writeFileSync(keyFile, saved + '\n', { flag: 'wx', mode: 0o600 }); key = Buffer.from(saved, 'hex'); }
        catch { /* unavailable until a valid key is configured */ }
      }
      if (existsSync(keyFile)) chmodSync(keyFile, 0o600);
    }
    this.key = key;
    if (!key || !existsSync(this.file)) {
      this.ready = Boolean(key);
      return;
    }
    try {
      const envelope = JSON.parse(readFileSync(this.file, 'utf8')) as { iv: string; tag: string; ciphertext: string };
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'hex'));
      decipher.setAuthTag(Buffer.from(envelope.tag, 'hex'));
      const parsed = JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'hex')), decipher.final()]).toString('utf8')) as TrackingRecord[];
      if (!Array.isArray(parsed)) throw new Error('Arquivo de rastreamento inválido.');
      this.records = parsed;
      this.ready = true;
    } catch (error) {
      // Arquivo corrompido ou chave trocada NÃO pode derrubar o processo no
      // boot (RT-E-02): sobe sem rastreio público, preserva o arquivo como
      // está para recuperação manual e registra o motivo em evento.
      this.ready = false;
      log('error', 'rastreio.arquivo_ilegivel', {
        motivo: error instanceof Error ? error.message : String(error),
        arquivo: 'tracking.enc.json',
        acao: 'servindo_sem_rastreio_ate_correcao_manual',
      });
    }
  }
  private persist() {
    if (!this.key) throw new Error('Armazenamento de rastreamento indisponível.');
    const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(this.records)), cipher.final()]);
    const temp = this.file + '.' + process.pid + '.tmp';
    writeFileSync(temp, JSON.stringify({ iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), ciphertext: ciphertext.toString('hex') }) + '\n', { mode: 0o600 });
    chmodSync(temp, 0o600); renameSync(temp, this.file);
  }
  create(orderNumber: string, status: InternalShippingStatus = 'preparing') {
    if (!this.ready || !/^LOLA-\d{8}-[A-F0-9]{12}$/.test(orderNumber) || !STATUSES.has(status)) return null;
    const token = randomBytes(32).toString('base64url'); const now = new Date().toISOString();
    const record: TrackingRecord = {
      orderNumber, tokenHash: createHash('sha256').update(token).digest('hex'),
      carrierCode: null, status, createdAt: now, updatedAt: now,
      events: [{ id: randomUUID(), status, title: TITLES[status], description: 'Atualização registrada pela loja.', occurredAt: now, source: 'store' }],
    };
    const index = this.records.findIndex((item) => item.orderNumber === orderNumber);
    const previous = index >= 0 ? this.records[index] : undefined;
    if (index >= 0) this.records[index] = record; else this.records.push(record);
    try { this.persist(); return { token, tracking: this.publicView(record) }; }
    catch { if (index >= 0 && previous) this.records[index] = previous; else this.records = this.records.filter((item) => item !== record); return null; }
  }
  update(orderNumber: string, input: { status: InternalShippingStatus; carrierCode?: string; description?: string; location?: string }) {
    const record = this.records.find((item) => item.orderNumber === orderNumber);
    if (!record || !STATUSES.has(input.status)) return null;
    const code = input.carrierCode === undefined ? record.carrierCode : clean(input.carrierCode, 40);
    if (code && !/^[A-Z0-9]{8,20}$/i.test(code)) return null;
    const description = clean(input.description, 300) || (input.status === 'delivered' ? 'Entrega confirmada pela administração.' : 'Atualização registrada pela loja.');
    const location = clean(input.location, 120);
    const now = new Date().toISOString();
    const previous = { ...record, events: [...record.events] };
    record.status = input.status; record.carrierCode = code || null; record.updatedAt = now;
    record.events.push({ id: randomUUID(), status: input.status, title: TITLES[input.status], description, occurredAt: now, source: 'store', ...(location ? { location } : {}) });
    record.events = record.events.slice(-100);
    try { this.persist(); return this.publicView(record); }
    catch { Object.assign(record, previous); return null; }
  }
  lookup(token: string): PublicTracking | null {
    if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) return null;
    const hash = createHash('sha256').update(token).digest('hex');
    const record = this.records.find((item) => item.tokenHash === hash);
    return record ? this.publicView(record) : null;
  }
  private publicView(record: TrackingRecord): PublicTracking {
    return { orderNumber: record.orderNumber, carrierCode: record.carrierCode, status: record.status, events: record.events.map((event) => ({ ...event })), updatedAt: record.updatedAt };
  }
}
