import {
  createCipheriv, createDecipheriv, randomBytes, randomUUID,
} from 'node:crypto';
import {
  chmodSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { VALID_COUPONS, checkCoupon } from '../data/coupons';
import { log } from './logger';

export type PaymentMethod = 'pix' | 'boleto';
export type ShippingOptionId = 'pac' | 'sedex' | 'transportadora';
export interface OrderCatalogProduct { id: string; name: string; category: string; price: number; }
export interface StockLookup { get(productId: string): { disponivel: number } | undefined; }
export interface DraftOrderLine {
  productId: string; name: string; category: string; quantity: number;
  variant?: string; unitPriceCents: number; lineTotalCents: number;
}
/**
 * Dados pessoais do titular do pré-pedido (LGPD, art. 5º, I).
 *
 * Base legal provisória: art. 7º, V — tratamento para execução do contrato ou
 * de procedimentos preliminares a pedido do titular (é a cliente que pede o
 * pré-pedido e fornece o endereço para entrega). Não há consentimento separado
 * porque ele seria desnecessário e revogável a qualquer momento sem que o
 * pré-pedido pudesse existir.
 *
 * `complement` é opcional e opcional por design: aceita texto livre de até 120
 * caracteres, que é o único campo em que a cliente pode DIGITAR dado pessoal de
 * terceiro (ex.: "entregar na portaria da minha mãe, falar com 21 9..."). Por
 * isso `cleanText` recusa marcação e limita o tamanho — mas o texto livre nunca
 * é validável por completo, e a política de privacidade precisa dizer que o
 * endereço é fornecido pela própria cliente.
 */
export interface OrderCustomer {
  fullName: string; phone: string; cep: string; street: string; number: string;
  complement: string; neighborhood: string; city: string; state: string;
}
/**
 * Pré-pedido persistido em `.data/orders.enc.json` (AES-256-GCM, envelope v2).
 *
 * Minimização (LGPD, art. 6º, III): só entra aqui o que é necessário para
 * concluir a entrega e auditar a regra comercial. O que NÃO é gravado de
 * propósito: cartão/CVV/validade (nunca são recebidos), e-mail (não existe
 * cadastro), `giftWrap` como booleano (só o resultado em centavos),
 * endereço IP (fica mascarado no log, nunca no pedido) e o próprio corpo da
 * requisição.
 *
 * Retenção: art. 15, II — o tratamento termina quando a finalidade acaba.
 * `EncryptedOrderStore.purgeExpired` descarta registros acima de
 * `LOLA_ORDER_RETENTION_DAYS` (padrão 90); `redactedAt` marca o registro cujos
 * dados pessoais já foram apagados a pedido do titular (art. 18, VI), mantendo
 * apenas a casca comercial (número, data, itens e totais).
 */
export interface StoredOrderDraft {
  id: string; orderNumber: string; createdAt: string;
  status: 'awaiting_payment_setup'; paymentStatus: 'not_configured';
  paymentMethod: PaymentMethod; shippingOptionId: ShippingOptionId;
  termsAccepted: true; customer: OrderCustomer; items: DraftOrderLine[];
  itemCount: number; subtotalCents: number; discountCents: number;
  shippingCents: number; giftWrapCents: number; totalCents: number;
  couponCode: string | null;
  /** Presente apenas quando `customer` foi anonimizado a pedido do titular. */
  redactedAt?: string;
}
export interface PublicOrderDraft {
  orderNumber: string; createdAt: string;
  status: 'awaiting_payment_setup'; paymentStatus: 'not_configured';
  paymentMethod: PaymentMethod; shippingOptionId: ShippingOptionId;
  itemCount: number; subtotal: number; discount: number;
  shipping: number; giftWrap: number; total: number;
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

/**
 * CEP com sanidade mínima.
 *
 * O CEP brasileiro não tem dígito verificador, então não há checagem exata sem
 * base de dados. Dá, porém, para recusar o que nunca foi CEP: fora da faixa
 * real (01000-000 a 99999-999) e as sequências degeneradas `00000000`,
 * `11111111`... que são o preenchimento de gente passando pela validação.
 *
 * Endereço ainda não é reconciliado com o ViaCEP: isso recusaria pedidos de CEP
 * não consultável e é decisão comercial, não correção de segurança.
 */
function isValidCep(digits: string): boolean {
  if (digits.length !== 8 || !/^\d{8}$/.test(digits)) return false;
  const value = Number(digits);
  if (value < 1_000_000 || value > 99_999_999) return false;
  return !/^(\d)\1{7}$/.test(digits);
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  // VUL-09: nenhum campo de texto livre aceita marcação HTML/JS. Os dados do
  // cliente são persistidos e reexibidos no painel administrativo; rejeitar na
  // entrada fecha o XSS armazenado sem precisar escapar na saída.
  if (/[<>]/.test(text)) return null;
  return text.length <= maxLength ? text : null;
}
/** Detecção separada só para devolver uma mensagem de erro honesta ao cliente. */
function containsMarkup(value: unknown): boolean {
  return typeof value === 'string' && /[<>]/.test(value);
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
  /** Contagem de usos de um cupom, vinda de quem tem os pré-pedidos gravados. */
  couponUses?: (code: string) => number,
): BuildOrderResult {
  if (!isObject(raw)) return { ok: false, status: 400, error: 'Dados do pré-pedido inválidos.' };
  if (!isObject(raw.customer)) return { ok: false, status: 400, error: 'Preencha os dados de entrega.' };

  const inputCustomer = raw.customer;
  if (Object.values(inputCustomer).some(containsMarkup)) {
    return { ok: false, status: 400, error: 'Os campos de endereço não podem conter caracteres de marcação (< ou >).' };
  }
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
  if (!isValidCep(cep)) return { ok: false, status: 400, error: 'Informe um CEP brasileiro válido com 8 dígitos.' };
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
  if (raw.couponCode !== undefined && raw.couponCode !== null && raw.couponCode !== '') {
    if (typeof raw.couponCode !== 'string' || raw.couponCode.length > 40) return { ok: false, status: 400, error: 'Cupom inválido.' };
    const normalized = raw.couponCode.trim().toUpperCase();
    // Só a existência aqui. As regras (validade, mínimo, teto de usos) precisam
    // do subtotal e são conferidas logo abaixo, quando ele já existe.
    if (!normalized || !Object.prototype.hasOwnProperty.call(VALID_COUPONS, normalized)) {
      return { ok: false, status: 400, error: 'O cupom informado não é válido.' };
    }
    couponCode = normalized;
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

  // VUL-CUPOM: os códigos eram público, sem validade, sem mínimo e sem teto de
  // uso — 15% para sempre, aplicado por qualquer um. As regras agora são
  // conferidas aqui, no servidor, com o subtotal real em mãos.
  let couponPercentage = 0;
  if (couponCode) {
    const verdict = checkCoupon({
      code: couponCode,
      subtotalCents,
      now,
      uses: couponUses?.(couponCode),
    });
    if (!verdict.ok) return { ok: false, status: 400, error: verdict.error };
    couponPercentage = verdict.percentage;
  }

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
  /** `true` quando os dados pessoais já foram apagados (LGPD, art. 18, VI). */
  redacted: boolean;
}

export function toAdminOrder(order: StoredOrderDraft): AdminOrderView {
  return {
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
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
    redacted: Boolean(order.redactedAt),
  };
}

export function toPublicOrder(order: StoredOrderDraft): PublicOrderDraft {
  return {
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
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

interface EncryptedEnvelope { version: 1 | 2; iv: string; tag: string; ciphertext: string; }

/**
 * Dados autenticados adicionais do envelope v2.
 *
 * Sem AAD, o AES-256-GCM protegia o conteúdo mas não o CONTEXTO: qualquer
 * envelope válido emitido pelo próprio serviço era aceito em qualquer lugar —
 * trocar `orders.enc.json` por um envelope antigo (para desfazer exclusões) ou
 * por um arquivo de outro diretório passava despercebido. O AAD amarra a cifra
 * a este nome fixo, então só o envelope certificado decifra aqui.
 *
 * Não é segredo: AAD não precisa ser oculto, precisa ser constante e coberto
 * pela tag GCM. Exportado apenas para o teste de regressão.
 */
export const ORDERS_AAD = 'lola-orders|orders.enc.json';

const DAY_MS = 86_400_000;

/**
 * Retenção padrão dos pré-pedidos, em dias (LGPD, art. 15, II e VI).
 *
 * O pré-pedido existe para que a loja entre em contato e conclua a venda: essa
 * é a finalidade, e ela se encerra em poucas semanas. 90 dias cobrem o
 * acompanhamento de uma negociação aberta sem virar arquivo permanente — e sem
 * depender de "a loja gira o arquivo quando o disco enche", que é teto de
 * espaço, não retenção. Configure com `LOLA_ORDER_RETENTION_DAYS`.
 *
 * Atenção à rotação de chave: apagar NÃO depende da chave antiga — o registro é
 * removido do array e todo o arquivo é reescrito com a chave vigente. Uma chave
 * nova só torna ILEGÍVEL o arquivo que não for reescrito; por isso nunca troque
 * a chave sem regravar (o `persist()` deste módulo regrava sempre).
 */
export const DEFAULT_ORDER_RETENTION_DAYS = 90;

/**
 * Converte `LOLA_ORDER_RETENTION_DAYS` em milissegundos.
 *
 *  - ausente/inválido → padrão de 90 dias (o padrão NUNCA é "para sempre");
 *  - `0` → expiração desligada, só para quem assumir explicitamente o risco;
 *  - fora da faixa → arredonda para 1..3650 dias.
 */
export function resolveOrderRetentionMs(days: number | undefined): number {
  if (days === undefined || !Number.isFinite(days)) return DEFAULT_ORDER_RETENTION_DAYS * DAY_MS;
  if (days === 0) return 0;
  return Math.min(3650, Math.max(1, Math.round(days))) * DAY_MS;
}

/** Dígitos de um telefone, que é como ele é gravado (`buildOrderDraft` remove `\D`). */
function phoneDigits(raw: unknown): string {
  return typeof raw === 'string' ? raw.replace(/\D/g, '') : '';
}

/**
 * Chaves possíveis para a MESMA caixa telefônica.
 *
 * A cliente digita como quer: `21 98765-4321`, `(21) 98765-4321` ou
 * `+55 21 98765-4321`. Todas viram a mesma chave. O prefixo 55 só é removido
 * quando sobram dígitos para um número COM DDD (mais de 11): DDD 55 (Santa
 * Maria/RS) em número fixo tem 10 dígitos e nunca é cortado.
 */
function phoneSearchKeys(raw: unknown): string[] {
  const digits = phoneDigits(raw);
  if (!digits) return [];
  const keys = new Set<string>([digits]);
  if (digits.length > 11 && digits.startsWith('55')) keys.add(digits.slice(2));
  return [...keys];
}

/**
 * Nome sem acento e em caixa baixa para comparação.
 *
 * "João" e "joao" precisam achar a mesma pessoa, senão a busca por nome do
 * titular (LGPD, art. 18, I e V) falha para a maioria dos nomes brasileiros.
 */
function normalizePersonName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

/** Cliente apagado: só o comprimento dos campos, nenhum dado pessoal sobra. */
const EMPTY_CUSTOMER: OrderCustomer = {
  fullName: '', phone: '', cep: '', street: '', number: '',
  complement: '', neighborhood: '', city: '', state: '',
};

/**
 * Encrypted JSON storage for a single Node process. In production, the key must
 * come from the environment; missing/invalid keys disable order registration.
 */
export class EncryptedOrderStore {
  /** Teto do arquivo único em disco; acima disso a escrita falharia silenciosamente. */
  static readonly MAX_RECORDS = 10_000;
  /** 90% do teto: ponto em que o operador precisa rolar o arquivo antes de chegar no limite. */
  private static readonly CAPACITY_WARNING = Math.floor(EncryptedOrderStore.MAX_RECORDS * 0.9);

  private readonly filePath: string;
  private readonly key?: Buffer;
  private records: StoredOrderDraft[] = [];
  private capacityWarned = false;
  readonly ready: boolean;
  readonly unavailableReason: string | null;
  /**
   * Retenção efetiva em milissegundos; `0` desligada (só por decisão explícita).
   * Veja {@link DEFAULT_ORDER_RETENTION_DAYS}.
   */
  readonly retentionMs: number;
  /**
   * Índice telefone → números de pré-pedido (LGPD, art. 18, I e V).
   *
   * Sem isto, atender um pedido do titular exigiria decifrar e varrer os 10.000
   * registros por chamada e o operador ainda não teria como perguntar "existe
   * tratamento meus dados?" sem saber o número do pedido — que é justamente o
   * dado que o titular NÃO tem em mãos depois que o e-mail de confirmação
   * nunca veio. O índice guarda apenas o telefone gravado, é reconstruído na
   * carga e atualizado em toda mutação.
   */
  private readonly phoneIndex = new Map<string, Set<string>>();

  constructor(directory: string, keyHex?: string, production = false, keyFilePath?: string, retentionDays?: number) {
    this.filePath = join(directory, 'orders.enc.json');
    this.retentionMs = resolveOrderRetentionMs(retentionDays);
    let key: Buffer | undefined;
    let reason: string | null = null;

    if (keyHex) {
      if (!/^[a-f\d]{64}$/i.test(keyHex)) reason = 'LOLA_ORDERS_ENCRYPTION_KEY deve conter exatamente 64 caracteres hexadecimais.';
      else key = Buffer.from(keyHex, 'hex');
    } else if (keyFilePath) {
      // VUL-17: permite guardar a chave FORA do diretório de dados, em vez de
      // ao lado do próprio ciphertext. É o padrão dos volumes de segredo do
      // Docker e do Kubernetes, e é o que separa "quem lê o backup" de "quem
      // tem a chave".
      try {
        const text = readFileSync(keyFilePath, 'utf8').trim();
        if (!/^[a-f\d]{64}$/i.test(text)) reason = 'O arquivo de chave de pedidos (LOLA_ORDERS_KEY_FILE) não contém 64 caracteres hexadecimais.';
        else key = Buffer.from(text, 'hex');
        if (production && key) {
          const mode = statSync(keyFilePath).mode & 0o777;
          if ((mode & 0o077) !== 0) {
            key = undefined;
            reason = 'O arquivo de chave de pedidos em produção precisa de permissão 0600 (sem acesso de grupo ou de outros).';
          }
        }
      } catch {
        reason = 'Não foi possível ler o arquivo de chave de pedidos (LOLA_ORDERS_KEY_FILE).';
      }
    } else if (production) {
      reason = 'Configure LOLA_ORDERS_ENCRYPTION_KEY ou LOLA_ORDERS_KEY_FILE (32 bytes em hexadecimal) para habilitar pré-pedidos em produção.';
    } else {
      try {
        mkdirSync(directory, { recursive: true, mode: 0o700 });
        const keyPath = join(directory, 'orders.key');
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
        // Permissões restritas são desejáveis, mas uma falha aqui não pode impedir o boot.
        try { if (existsSync(keyPath)) chmodSync(keyPath, 0o600); } catch { /* best effort */ }
        // VUL-17: em desenvolvimento a chave é criada DENTRO do diretório de
        // dados, na mesma pasta do ciphertext. Qualquer cópia de backup do
        // diretório leva os dois juntos, e qualquer leitura de arquivo resolve
        // a cifra. Aceitável só em dev; em produção a chave vem de fora.
        log('warn', 'pedidos.chave_local_ao_lado_dos_dados', {
          caminho: keyPath,
          impacto: 'aceitavel_apenas_em_desenvolvimento',
          acao: 'em_producao_use_LOLA_ORDERS_ENCRYPTION_KEY_ou_LOLA_ORDERS_KEY_FILE_fora_do_diretorio_de_dados',
        });
      } catch (error) {
        // VUL-05: erro de E/S no diretório local também reiniciava o processo em loop.
        // Motivo fica genérico porque ele é devolvido ao cliente via 503.
        reason = 'Não foi possível preparar o armazenamento local de pré-pedidos.';
        log('error', 'pedidos.diretorio_local_falhou', {
          motivo: (error as Error)?.message,
          impacto: 'pre_pedidos_indisponiveis',
        });
      }
    }

    this.key = key;

    let records: StoredOrderDraft[] = [];
    if (key && !reason) {
      try {
        mkdirSync(directory, { recursive: true, mode: 0o700 });
        if (existsSync(this.filePath)) {
          const envelope = JSON.parse(readFileSync(this.filePath, 'utf8')) as EncryptedEnvelope;
          // v1 foi gravado antes do AAD e continua legível; v2 vincula a cifra ao
          // arquivo. Qualquer outra versão é recusada em vez de decifrada às cegas.
          if (envelope.version !== 1 && envelope.version !== 2) {
            throw new Error('Versão desconhecida no arquivo cifrado de pedidos.');
          }
          const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'hex'));
          if (envelope.version === 2) decipher.setAAD(Buffer.from(ORDERS_AAD, 'utf8'));
          decipher.setAuthTag(Buffer.from(envelope.tag, 'hex'));
          const plaintext = Buffer.concat([
            decipher.update(Buffer.from(envelope.ciphertext, 'hex')), decipher.final(),
          ]).toString('utf8');
          const parsed: unknown = JSON.parse(plaintext);
          if (!Array.isArray(parsed)) throw new Error('Arquivo cifrado de pedidos inválido.');
          records = parsed as StoredOrderDraft[];
        }
      } catch (error) {
        // VUL-05: chave trocada/corrompida jogava a exceção para fora do construtor e
        // reiniciava o processo em loop. O arquivo permanece intacto; o servidor sobe
        // indisponível para pré-pedidos e o operador conserta a chave.
        records = [];
        reason = 'Não foi possível decifrar o arquivo de pré-pedidos (.data/orders.enc.json). '
          + 'Verifique LOLA_ORDERS_ENCRYPTION_KEY / LOLA_ORDERS_KEY_FILE ou restaure o backup do arquivo. '
          + 'O arquivo não foi alterado.';
        log('error', 'pedidos.arquivo_nao_decifrado', {
          motivo: (error as Error)?.message,
          impacto: 'pre_pedidos_indisponiveis_arquivo_intacto',
        });
      }
    }

    this.records = records;
    this.unavailableReason = reason;
    this.ready = Boolean(key) && !reason;
    this.rebuildPhoneIndex();
  }

  /** Reconstrói o índice de telefones a partir dos registros em memória. */
  private rebuildPhoneIndex() {
    this.phoneIndex.clear();
    for (const record of this.records) this.addToPhoneIndex(record);
  }

  private addToPhoneIndex(record: StoredOrderDraft) {
    const keys = phoneSearchKeys(record.customer?.phone);
    if (keys.length === 0) return;
    for (const key of keys) {
      const bucket = this.phoneIndex.get(key);
      if (bucket) bucket.add(record.orderNumber);
      else this.phoneIndex.set(key, new Set([record.orderNumber]));
    }
  }

  /**
   * Remove da memória e do disco os pré-pedidos acima da retenção (art. 15, II).
   *
   * Chamar na subida e depois em janela horária (ver `createLocalDataPlane`).
   * Se a escrita falhar, os registros voltam para a memória: uma exclusão que só
   * existe na RAM reaparece no próximo boot e o operador acredita que apagou.
   * Devolve quantos registros saíram de fato.
   */
  purgeExpired(now = Date.now()): number {
    if (!this.ready || this.retentionMs === 0 || this.records.length === 0) return 0;

    const expired = (record: StoredOrderDraft): boolean => {
      const createdAt = Date.parse(record.createdAt);
      // Data ilegível não é dado confiável: expira em vez de ficar para sempre.
      if (!Number.isFinite(createdAt)) return true;
      return now - createdAt > this.retentionMs;
    };

    const before = this.records;
    const kept = before.filter((record) => !expired(record));
    if (kept.length === before.length) return 0;

    this.records = kept;
    try {
      this.persist();
      this.rebuildPhoneIndex();
      return before.length - kept.length;
    } catch (error) {
      this.records = before;
      log('error', 'pedidos.retencao_falhou_gravar', {
        motivo: (error as Error)?.message,
        impacto: 'registros_expirados_permanecem_em_memoria_e_no_disco',
      });
      return 0;
    }
  }

  private persist() {
    if (!this.key) throw new Error('Criptografia de pedidos indisponível.');
    mkdirSync(join(this.filePath, '..'), { recursive: true, mode: 0o700 });
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(ORDERS_AAD, 'utf8'));
    const encrypted = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(this.records), 'utf8')), cipher.final()]);
    const envelope: EncryptedEnvelope = {
      version: 2, iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'),
      ciphertext: encrypted.toString('hex'),
    };
    const temp = this.filePath + '.' + process.pid + '.tmp';
    writeFileSync(temp, JSON.stringify(envelope) + '\n', { mode: 0o600 });
    chmodSync(temp, 0o600);
    renameSync(temp, this.filePath);
  }

  save(order: StoredOrderDraft): boolean {
    if (!this.ready) return false;
    if (this.atCapacity) {
      log('error', 'pedidos.capacidade_esgotada', {
        teto: EncryptedOrderStore.MAX_RECORDS,
        impacto: 'pre_pedido_recusado',
        acao: 'rotacione_o_arquivo_ou_migre_o_armazenamento',
      });
      return false;
    }
    this.records.push(order);
    try {
      this.persist();
      this.addToPhoneIndex(order);
      if (!this.capacityWarned && this.records.length >= EncryptedOrderStore.CAPACITY_WARNING) {
        this.capacityWarned = true;
        log('warn', 'pedidos.capacidade_quase_esgotada', {
          registros: this.records.length,
          teto: EncryptedOrderStore.MAX_RECORDS,
          acao: 'programe_a_rotacao_antes_de_esgotar_a_capacidade',
        });
      }
      return true;
    } catch (error) {
      this.records.pop();
      log('error', 'pedidos.persistencia_falhou', {
        motivo: (error as Error)?.message,
        impacto: 'pre_pedido_nao_gravado',
      });
      return false;
    }
  }

  /**
   * Capacidade esgotada. O chamador deve responder 503 (recuperável) em vez de
   * deixar o `false` genérico virar um 500 permanente sem causa identificável.
   */
  get atCapacity(): boolean {
    return this.records.length >= EncryptedOrderStore.MAX_RECORDS;
  }

  hasOrder(orderNumber: string): boolean {
    return this.records.some((record) => record.orderNumber === orderNumber);
  }

  findByOrderNumber(orderNumber: string): StoredOrderDraft | undefined {
    const record = this.records.find((item) => item.orderNumber === orderNumber);
    return record ? JSON.parse(JSON.stringify(record)) as StoredOrderDraft : undefined;
  }

  /**
   * Todos os pré-pedidos de um telefone (LGPD, art. 18, I e V).
   *
   * É a porta de entrada do atendimento ao titular: telefone é o único dado que
   * ele realmente tem em mãos. `orderNumber` sozinho não resolve — ele só
   * existe se o cliente anotou a confirmação que o site mostrou uma vez.
   * Busca O(1) no índice; devolve cópias, como `findByOrderNumber`.
   */
  findByPhone(rawPhone: string): StoredOrderDraft[] {
    const matches = new Set<string>();
    for (const key of phoneSearchKeys(rawPhone)) {
      const bucket = this.phoneIndex.get(key);
      if (bucket) for (const orderNumber of bucket) matches.add(orderNumber);
    }
    const found: StoredOrderDraft[] = [];
    for (const orderNumber of matches) {
      const record = this.findByOrderNumber(orderNumber);
      if (record) found.push(record);
    }
    return found;
  }

  /**
   * Pré-pedidos cujo nome contém o fragmento informado, sem acento e sem
   * distinção de caixa. Complementa a busca por telefone quando o titular não
   * lembra o número usado na entrega.
   */
  searchByName(fragment: string): StoredOrderDraft[] {
    const needle = normalizePersonName(fragment);
    if (!needle) return [];
    return this.records
      .filter((record) => normalizePersonName(record.customer?.fullName).includes(needle))
      .map((record) => JSON.parse(JSON.stringify(record)) as StoredOrderDraft);
  }

  /**
   * Busca única do fluxo de direitos do titular (art. 18, I e V).
   *
   * Devolve do mais recente para o mais antigo, sem limite: quem atende o
   * pedido precisa saber o TOTAL de registros existentes antes de responder
   * "sim, tratamos seus dados". A rota administrativa trunca a resposta.
   */
  searchByTitular(query: { phone?: string; name?: string }): StoredOrderDraft[] {
    const phone = (query.phone ?? '').trim();
    const name = (query.name ?? '').trim();
    if (!phone && !name) return [];
    const base = phone ? this.findByPhone(phone) : [...this.records];
    const needle = normalizePersonName(name);
    const matched = needle
      ? base.filter((record) => normalizePersonName(record.customer?.fullName).includes(needle))
      : base;
    return matched.reverse();
  }

  /**
   * Elimina o pré-pedido inteiro (LGPD, art. 18, VI — supressão).
   *
   * O arquivo é CIFRADO, não criptografado campo a campo: um registro não sai
   * sozinho. A supressão reescreve o arquivo completo com a MESMA chave vigente,
   * então os demais registros continuam legíveis — não há necessidade de
   * rotacionar chave (e rotacionar deixaria o resto ilegível, porque só existe
   * uma chave por arquivo).
   *
   * Devolve `false` para registro inexistente ou armazenamento indisponível;
   * em falha de escrita a memória é restaurada, para o registro não "sumir"
   * só na RAM.
   */
  remove(orderNumber: string): boolean {
    if (!this.ready) return false;
    const before = this.records;
    const kept = before.filter((item) => item.orderNumber !== orderNumber);
    if (kept.length === before.length) return false;
    this.records = kept;
    try {
      this.persist();
      this.rebuildPhoneIndex();
      return true;
    } catch (error) {
      this.records = before;
      log('error', 'pedidos.eliminacao_falhou', {
        motivo: (error as Error)?.message,
        impacto: 'registro_permanece_em_memoria_e_no_disco',
      });
      return false;
    }
  }

  /**
   * Apaga SÓ os dados pessoais, mantendo a casca comercial (LGPD, art. 18, VI,
   * c/c art. 16 — dever de guardar o registro de operação quando a lei exigir).
   *
   * Escolha entre `remove` e `redact` conforme a política da loja: pré-pedido
   * que nunca virou venda, `remove`; registro que precisa sobreviver para
   * conferência de cupom/estoque, `redact`. Nos dois casos a resposta ao titular
   * é a mesma — nenhum dado pessoal permanece acessível.
   *
   * `redactedAt` deixa o fato registrado para o art. 37 sem guardar quem pediu.
   */
  redact(orderNumber: string, now = new Date()): boolean {
    if (!this.ready) return false;
    const before = this.records;
    const index = before.findIndex((item) => item.orderNumber === orderNumber);
    if (index === -1) return false;
    const next = [...before];
    next[index] = {
      ...before[index],
      customer: { ...EMPTY_CUSTOMER },
      redactedAt: now.toISOString(),
    };
    this.records = next;
    try {
      this.persist();
      this.rebuildPhoneIndex();
      return true;
    } catch (error) {
      this.records = before;
      log('error', 'pedidos.anonimizacao_falhou', {
        motivo: (error as Error)?.message,
        impacto: 'dados_pessoais_permanecem_no_arquivo_e_na_memoria',
      });
      return false;
    }
  }

  listRecent(limit = 50): StoredOrderDraft[] {
    const boundedLimit = Number.isSafeInteger(limit) ? Math.min(Math.max(limit, 1), 100) : 50;
    return this.records.slice(-boundedLimit).reverse().map(
      (item) => JSON.parse(JSON.stringify(item)) as StoredOrderDraft,
    );
  }

  /**
   * Quantos pré-pedidos já gravados usaram este cupom.
   *
   * Conta sobre o arquivo atual: quando o operador o rota para liberar espaço,
   * o contador recomeça junto. É o teto que dá para oferecer sem um banco de
   * dados — e ainda assim é muito melhor que "para sempre".
   *
   * `couponCode` é gravado porque sem ele o teto de usos é contável só na
   * memória do processo. Não é dado pessoal por si (é código promocional de
   * circulação pública): `remove` o leva junto com o registro, e `redact`
   * mantém — apagá-lo liberaria o teto de usos a quem pedisse anonimização.
   */
  couponUseCount(code: string): number {
    const normalized = code.trim().toUpperCase();
    let total = 0;
    for (const record of this.records) {
      if (record.couponCode && record.couponCode.toUpperCase() === normalized) total += 1;
    }
    return total;
  }

  get size(): number { return this.records.length; }
}
