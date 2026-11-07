import { InternalClient } from './internalClient';
import { type DataPlane, type DataPlaneResult, PEDIDOS_INDISPONIVEL } from './dataPlane';
import { type CatalogInfo } from './catalog';
import { log, loggableIp } from './logger';

/**
 * Plano de dados do site público: fala com o servidor de dados por HTTP
 * autenticado e nunca guarda autoridade nenhuma.
 *
 * Três propriedades importam aqui:
 *
 *  - **cache com janela curta**, para que a vitrine não faça uma ida ao servidor
 *    de dados por visita de página;
 *  - **`stale-if-error` limitado**: queda curta do servidor de dados serve o
 *    último snapshot em vez de derrubar a loja. Não abre brecha de oversell
 *    porque validação e reserva continuam autoritativas do outro lado;
 *  - **single-flight**: várias requisições simultâneas que estouram o cache
 *    compartilham uma chamada só, em vez de multiplicar a fila contra o vizinho.
 */

const DEFAULT_TTL_MS = 5_000;
const DEFAULT_STALE_MS = 60_000;
const MAX_LOG_INTERVAL_MS = 60_000;
const MAX_ERROR_MESSAGE = 400;

const ORDER_STRING_FIELDS = [
  'orderNumber', 'createdAt', 'status', 'paymentStatus',
  'paymentMethod', 'shippingOptionId',
] as const;
const ORDER_NUMBER_FIELDS = [
  'itemCount', 'subtotal', 'discount', 'shipping', 'giftWrap', 'total',
] as const;

interface CacheEntry {
  value: Record<string, number>;
  fetchedAt: number;
  expiresAt: number;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

/**
 * Reduz a resposta do servidor de dados ao que a vitrine usa.
 *
 * Só aceita ids que existem no catálogo e inteiros dentro de faixa, gravados em
 * um objeto sem protótipo. Mesmo que a fonte esteja comprometida, não há como
 * escrever em `Object.prototype` nem injetar chave estranha no cache.
 */
function sanitizeStock(
  body: Record<string, unknown>,
  allowedIds: ReadonlySet<string>,
): Record<string, number> | null {
  const source = body.stock;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  const entries = source as Record<string, unknown>;
  const stock: Record<string, number> = Object.create(null) as Record<string, number>;
  let matched = 0;
  for (const id of Object.keys(entries)) {
    if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(id)) continue;
    const raw = entries[id];
    if (typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0 && raw <= 1_000_000_000) {
      stock[id] = raw;
      matched += 1;
    }
  }
  return matched > 0 || Object.keys(entries).length === 0 ? stock : null;
}

function sanitizeCatalog(body: Record<string, unknown>): CatalogInfo[] | null {
  if (!Array.isArray(body.products) || body.products.length > 5000) return null;
  const ids = new Set<string>();
  const result: CatalogInfo[] = [];
  for (const raw of body.products) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const p = raw as Record<string, unknown>;
    if (typeof p.id !== 'string' || !/^[a-z0-9][a-z0-9_-]{1,63}$/.test(p.id) || ids.has(p.id) ||
        typeof p.name !== 'string' || p.name.length < 1 || p.name.length > 120 ||
        typeof p.category !== 'string' || !['Brincos', 'Colares', 'Pulseiras', 'Anéis', 'Conjuntos'].includes(p.category) ||
        typeof p.price !== 'number' || !Number.isFinite(p.price) || p.price < 0 || p.price > 100000 ||
        typeof p.material !== 'string' || p.material.length > 80 ||
        typeof p.color !== 'string' || p.color.length > 80 ||
        typeof p.desc !== 'string' || p.desc.length > 2000 ||
        typeof p.image !== 'string' || p.image.length > 2048 ||
        typeof p.disponivel !== 'number' || !Number.isSafeInteger(p.disponivel) || p.disponivel < 0) return null;
    ids.add(p.id);
    result.push({
      id: p.id, name: p.name, category: p.category, price: p.price,
      material: p.material, color: p.color, desc: p.desc, image: p.image,
      disponivel: p.disponivel,
    });
  }
  return result;
}

/** Mensagem de erro passa adiante só se for texto curto e sem controle. */
function sanitizeErrorMessage(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return text && text.length <= MAX_ERROR_MESSAGE ? text : null;
}

function isPublicOrder(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const order = value as Record<string, unknown>;
  for (const field of ORDER_STRING_FIELDS) {
    if (typeof order[field] !== 'string') return false;
  }
  for (const field of ORDER_NUMBER_FIELDS) {
    if (typeof order[field] !== 'number' || !Number.isFinite(order[field])) return false;
  }
  return true;
}

/**
 * Reconstrói o pedido com só os campos públicos, em objeto novo.
 *
 * Validar que os campos esperados existem não basta: se repassássemos o objeto
 * recebido como está, qualquer campo a mais que o servidor de dados mandasse —
 * inclusive um vazamento de dado pessoal por engano lá do outro lado — chegaria
 * ao navegador. Esta vitrine é a máquina menos confiável da arquitetura, então
 * ela impõe o contrato público ela mesma em vez de confiar no vizinho.
 */
function projectPublicOrder(value: unknown): Record<string, unknown> {
  const order = value as Record<string, unknown>;
  const projected: Record<string, unknown> = {};
  for (const field of [...ORDER_STRING_FIELDS, ...ORDER_NUMBER_FIELDS]) {
    projected[field] = order[field];
  }
  return projected;
}

export interface HttpDataPlaneOptions {
  ttlMs?: number;
  staleMs?: number;
  /** Ids do catálogo: a única chave aceita no snapshot. */
  allowedIds: ReadonlySet<string>;
}

export class HttpDataPlane implements DataPlane {
  private readonly client: InternalClient;
  private readonly ttlMs: number;
  private readonly staleMs: number;
  private readonly allowedIds: ReadonlySet<string>;
  private cache: CacheEntry | null = null;
  private inflight: Promise<Record<string, number> | null> | null = null;
  private readonly lastFailureLogAt = new Map<string, number>();

  constructor(client: InternalClient, options: HttpDataPlaneOptions) {
    this.client = client;
    this.ttlMs = clampInt(options.ttlMs, 0, 600_000, DEFAULT_TTL_MS);
    this.staleMs = clampInt(options.staleMs, 0, 3_600_000, DEFAULT_STALE_MS);
    this.allowedIds = options.allowedIds;
  }

  private throttleLog(key: string, event: string, fields: Record<string, unknown>): void {
    const now = Date.now();
    const previous = this.lastFailureLogAt.get(key) ?? 0;
    if (now - previous < MAX_LOG_INTERVAL_MS) return;
    this.lastFailureLogAt.set(key, now);
    log('error', event, fields);
  }

  async catalog(): Promise<CatalogInfo[] | null> {
    const result = await this.client.call('GET', '/internal/catalog');
    if (!result.ok || !result.body) {
      this.throttleLog('catalogo', 'plano.catalogo_falhou', {
        alvo: this.client.target, status: result.status, motivo: result.failure ?? 'desconhecido',
      });
      return null;
    }
    const products = sanitizeCatalog(result.body);
    if (!products) {
      this.throttleLog('catalogo_formato', 'plano.catalogo_invalido', {
        alvo: this.client.target, status: result.status,
      });
      return null;
    }
    return products;
  }

  async snapshot(): Promise<Record<string, number> | null> {
    const now = Date.now();
    if (this.cache && now < this.cache.expiresAt) return this.cache.value;
    if (this.inflight) return this.inflight;

    this.inflight = this.fetchSnapshot();
    try {
      return await this.inflight;
    } finally {
      this.inflight = null;
    }
  }

  private staleSnapshot(fallback: null): Record<string, number> | null {
    if (!this.cache) return fallback;
    if (Date.now() - this.cache.fetchedAt <= this.staleMs) {
      this.throttleLog('snapshot_defasado', 'plano.snapshot_defasado', {
        alvo: this.client.target, idadeMs: Date.now() - this.cache.fetchedAt,
      });
      return this.cache.value;
    }
    return fallback;
  }

  private async fetchSnapshot(): Promise<Record<string, number> | null> {
    const result = await this.client.call('GET', '/internal/estoque');
    if (!result.ok || !result.body) {
      this.throttleLog('snapshot', 'plano.snapshot_falhou', {
        alvo: this.client.target, status: result.status, motivo: result.failure ?? 'desconhecido',
      });
      return this.staleSnapshot(null);
    }
    const stock = sanitizeStock(result.body, this.allowedIds);
    if (!stock) {
      this.throttleLog('snapshot_formato', 'plano.snapshot_invalido', {
        alvo: this.client.target, status: result.status,
      });
      return this.staleSnapshot(null);
    }
    const at = Date.now();
    this.cache = { value: stock, fetchedAt: at, expiresAt: at + this.ttlMs };
    return stock;
  }

  async createDraft(body: unknown, meta: { ip: string }): Promise<DataPlaneResult> {
    const result = await this.client.call('POST', '/internal/pedidos', body);
    if (!result.ok || !result.body) {
      this.throttleLog('pedido', 'plano.pedido_falhou', {
        alvo: this.client.target, status: result.status, ip: loggableIp(meta.ip),
        motivo: result.failure ?? 'desconhecido',
      });
      // Falha fechada: sem resposta utilizável não há pedido. Nada aqui
      // revela ao cliente que existe um servidor de dados atrás.
      return { status: 503, body: { error: PEDIDOS_INDISPONIVEL } };
    }

    if (result.status === 201 && result.body.success === true && isPublicOrder(result.body.order)) {
      return { status: 201, body: { success: true, order: projectPublicOrder(result.body.order) } };
    }

    const message = sanitizeErrorMessage(result.body.error);
    const statusValido = Number.isInteger(result.status) && result.status >= 400 && result.status <= 599;
    if (!message || !statusValido) {
      // Status fora da faixa de erro é uma resposta anômala: repassar o texto
      // junto produziria algo contraditório, como um 503 dizendo "tente depois
      // mais tarde" com a mensagem de recusa de negócio embaixo. Resposta
      // anômala se invalida por inteiro.
      this.throttleLog('pedido_formato', 'plano.pedido_resposta_invalida', {
        alvo: this.client.target, status: result.status,
      });
      return { status: 503, body: { error: PEDIDOS_INDISPONIVEL } };
    }
    return { status: result.status, body: { error: message } };
  }
}
