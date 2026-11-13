/**
 * Cliente HTTP do Asaas para execução EXCLUSIVA no Data Server privado.
 *
 * Não é um endpoint público e NÃO autoriza cobranças/reembolsos por si só.
 * O serviço de domínio deve antes autenticar o cliente, validar estoque e
 * total calculado em transação PostgreSQL, persistir a intenção idempotente,
 * vincular o customer à order e, no reembolso, exigir RBAC/MFA e auditoria.
 *
 * Nunca use API key no Vite, no site público ou no BFF Admin.
 * Referência API: https://docs.asaas.com/docs/authentication-2
 */

export type AsaasEnvironment = 'sandbox' | 'production';

export interface AsaasClientConfig {
  environment: AsaasEnvironment;
  apiKey: string;
  /** Habilitação deliberada, posterior à homologação. Sem isto a produção recusa. */
  productionApproved?: boolean;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface PixChargeRequest {
  asaasCustomerId: string;
  amountCents: number;
  dueDate: string;
  externalReference: string;
}

export interface CheckoutItem {
  name: string;
  quantity: number;
  valueCents: number;
  imageBase64: string;
  externalReference?: string;
}

export interface CardCheckoutRequest {
  asaasCustomerId: string;
  externalReference: string;
  items: CheckoutItem[];
  minutesToExpire: number;
  callback: {
    successUrl: string;
    cancelUrl: string;
    expiredUrl?: string;
  };
}

export interface AuthorizedRefundRequest {
  /** Referência durável da autorização e idempotência no PostgreSQL. */
  approvalReference: string;
  asaasPaymentId: string;
  amountCents: number;
  description: string;
}

export class AsaasApiError extends Error {
  readonly status: number;
  constructor(status: number) {
    super('Operação financeira indisponível no provedor (HTTP ' + status + ').');
    this.name = 'AsaasApiError';
    this.status = status;
  }
}

const API_BASE: Record<AsaasEnvironment, string> = {
  sandbox: 'https://api-sandbox.asaas.com/v3/',
  production: 'https://api.asaas.com/v3/',
};

function ensureReference(value: unknown, field: string, max = 200): string {
  if (typeof value !== 'string' || value.length < 3 || value.length > max || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new TypeError(field + ' inválida.');
  }
  return value;
}

function ensureCents(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 99_999_999_999) {
    throw new RangeError('Valor deve ser inteiro positivo em centavos dentro do limite operacional.');
  }
  // Converte APENAS na borda da API. Cálculos e persistência usam integer cents.
  return Number((value / 100).toFixed(2));
}

function ensureDueDate(value: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TypeError('Vencimento inválido.');
  const parsed = new Date(value + 'T12:00:00Z');
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new TypeError('Vencimento inválido.');
  }
  return value;
}

function ensureRedirect(raw: string): string {
  let parsed: URL;
  try { parsed = new URL(raw); } catch { throw new TypeError('URL de retorno inválida.'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash || !parsed.hostname) {
    throw new TypeError('URL de retorno deve ser HTTPS sem credenciais ou fragmentos.');
  }
  return parsed.toString();
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Resposta inválida do provedor.');
  return value as Record<string, unknown>;
}

export class AsaasClient {
  private readonly apiKey: string;
  private readonly base: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: AsaasClientConfig) {
    if (config.environment !== 'sandbox' && config.environment !== 'production') throw new Error('Ambiente Asaas inválido.');
    const prefix = config.environment === 'production' ? '$aact_prod_' : '$aact_hmlg_';
    if (!config.apiKey?.startsWith(prefix) || config.apiKey.length < prefix.length + 12 || /\s/.test(config.apiKey)) {
      throw new Error('Credencial Asaas ausente ou incompatível com o ambiente configurado.');
    }
    if (config.environment === 'production' && config.productionApproved !== true) {
      throw new Error('Asaas produção bloqueado: falta autorização explícita de ativação.');
    }
    if (config.timeoutMs !== undefined && (!Number.isSafeInteger(config.timeoutMs) || config.timeoutMs < 1000 || config.timeoutMs > 30_000)) {
      throw new RangeError('Timeout Asaas fora da faixa segura.');
    }
    this.apiKey = config.apiKey;
    this.base = API_BASE[config.environment];
    this.timeoutMs = config.timeoutMs ?? 8000;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  private async request(method: 'GET' | 'POST', path: string, payload?: Record<string, unknown>): Promise<Record<string, unknown>> {
    // Os caminhos são inteiramente definidos nesta classe e IDs são validados,
    // impedindo SSRF e acesso a endpoints arbitrários pelo navegador.
    const response = await this.fetchImpl(new URL(path, this.base), {
      method,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'User-Agent': 'LOLA-Aco-Inox/1.0',
        access_token: this.apiKey,
      },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
      redirect: 'manual',
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok || response.status >= 300) throw new AsaasApiError(response.status);
    const length = Number(response.headers.get('content-length') || 0);
    if (Number.isFinite(length) && length > 256 * 1024) throw new Error('Resposta do Asaas excedeu limite seguro.');
    const body = await response.text();
    if (Buffer.byteLength(body, 'utf8') > 256 * 1024) throw new Error('Resposta do Asaas excedeu limite seguro.');
    let parsed: unknown;
    try { parsed = JSON.parse(body); } catch { throw new Error('Resposta JSON inválida do Asaas.'); }
    return asRecord(parsed);
  }

  async createPixCharge(input: PixChargeRequest): Promise<{ id: string; status: string }> {
    const customer = ensureReference(input.asaasCustomerId, 'Cliente Asaas', 120);
    if (!customer.startsWith('cus_')) throw new TypeError('Identificador de cliente Asaas inválido.');
    const body = await this.request('POST', 'payments', {
      customer,
      billingType: 'PIX',
      value: ensureCents(input.amountCents),
      dueDate: ensureDueDate(input.dueDate),
      externalReference: ensureReference(input.externalReference, 'Referência do pedido'),
    });
    if (typeof body.id !== 'string' || !body.id.startsWith('pay_') || typeof body.status !== 'string') {
      throw new Error('Resposta de cobrança Pix inválida.');
    }
    return { id: body.id, status: body.status };
  }

  async getPixQrCode(asaasPaymentId: string): Promise<{ encodedImage: string; payload: string; expirationDate: string | null }> {
    const paymentId = ensureReference(asaasPaymentId, 'Cobrança Asaas', 120);
    if (!paymentId.startsWith('pay_')) throw new TypeError('Identificador de cobrança Asaas inválido.');
    const body = await this.request('GET', 'payments/' + paymentId + '/pixQrCode');
    if (typeof body.encodedImage !== 'string' || !body.encodedImage ||
        typeof body.payload !== 'string' || !body.payload) {
      throw new Error('QR Code Pix inválido no retorno do provedor.');
    }
    return {
      encodedImage: body.encodedImage,
      payload: body.payload,
      expirationDate: typeof body.expirationDate === 'string' ? body.expirationDate : null,
    };
  }

  async getPayment(asaasPaymentId: string): Promise<{ id: string; status: string; value: number; externalReference: string | null }> {
    const id = ensureReference(asaasPaymentId, 'Cobrança Asaas', 120);
    if (!id.startsWith('pay_')) throw new TypeError('Identificador de cobrança Asaas inválido.');
    const body = await this.request('GET', 'payments/' + id);
    if (body.id !== id || typeof body.status !== 'string' || typeof body.value !== 'number' || !Number.isFinite(body.value)) {
      throw new Error('Resposta de conciliação inválida.');
    }
    return {
      id,
      status: body.status,
      value: body.value,
      externalReference: typeof body.externalReference === 'string' ? body.externalReference : null,
    };
  }

  async createCardCheckout(input: CardCheckoutRequest): Promise<{ id: string; link: string }> {
    const customer = ensureReference(input.asaasCustomerId, 'Cliente Asaas', 120);
    if (!customer.startsWith('cus_')) throw new TypeError('Identificador de cliente Asaas inválido.');
    if (!Array.isArray(input.items) || !input.items.length || input.items.length > 50) {
      throw new TypeError('Itens do checkout inválidos.');
    }
    if (!Number.isSafeInteger(input.minutesToExpire) || input.minutesToExpire < 10 || input.minutesToExpire > 1440) {
      throw new RangeError('Expiração do checkout fora da faixa permitida.');
    }
    const items = input.items.map((item) => {
      if (typeof item.name !== 'string' || !item.name.trim() || item.name.length > 30 ||
          !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 999 ||
          typeof item.imageBase64 !== 'string' || !item.imageBase64) {
        throw new TypeError('Item do checkout inválido; é obrigatória imagem real em Base64.');
      }
      return {
        name: item.name.trim(),
        quantity: item.quantity,
        value: ensureCents(item.valueCents),
        imageBase64: item.imageBase64,
        ...(item.externalReference ? { externalReference: ensureReference(item.externalReference, 'Produto') } : {}),
      };
    });
    const body = await this.request('POST', 'checkouts', {
      billingTypes: ['CREDIT_CARD'],
      chargeTypes: ['DETACHED'],
      customer,
      externalReference: ensureReference(input.externalReference, 'Referência do pedido'),
      items,
      minutesToExpire: input.minutesToExpire,
      callback: {
        successUrl: ensureRedirect(input.callback.successUrl),
        cancelUrl: ensureRedirect(input.callback.cancelUrl),
        ...(input.callback.expiredUrl ? { expiredUrl: ensureRedirect(input.callback.expiredUrl) } : {}),
      },
    });
    if (typeof body.id !== 'string' || typeof body.link !== 'string') throw new Error('Checkout sem identificador/link.');
    const checkout = new URL(body.link);
    if (checkout.protocol !== 'https:' || (checkout.hostname !== 'asaas.com' && !checkout.hostname.endsWith('.asaas.com'))) {
      throw new Error('Checkout retornou destino não autorizado.');
    }
    return { id: body.id, link: body.link };
  }

  /** Chamar somente após intenção durável, RBAC e idempotência validados. */
  async refundApproved(input: AuthorizedRefundRequest): Promise<{ id: string; status: string }> {
    ensureReference(input.approvalReference, 'Aprovação do reembolso');
    const id = ensureReference(input.asaasPaymentId, 'Cobrança Asaas', 120);
    if (!id.startsWith('pay_')) throw new TypeError('Identificador de cobrança Asaas inválido.');
    if (typeof input.description !== 'string' || input.description.trim().length < 5 || input.description.length > 500) {
      throw new TypeError('Justificativa de reembolso inválida.');
    }
    const body = await this.request('POST', 'payments/' + id + '/refund', {
      value: ensureCents(input.amountCents),
      description: input.description.trim(),
    });
    if (typeof body.id !== 'string' || typeof body.status !== 'string') {
      throw new Error('Resposta de reembolso inválida.');
    }
    return { id: body.id, status: body.status };
  }
}
