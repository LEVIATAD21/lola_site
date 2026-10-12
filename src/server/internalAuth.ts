import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import { log } from './logger';

/**
 * Canal máquina-a-máquina entre o site público e o servidor de dados.
 *
 * Um token estático no header seria o suficiente "enquanto a rede for
 * privada" — e é exatamente esse pressuposto que um atacante que chega na rede
 * entre os dois servidores derruba. Aqui cada requisição leva:
 *
 *  - um **timestamp** assinado, com janela curta: capturar e reenviar amanhã
 *    não funciona;
 *  - um **nonce** assinado e consumido uma única vez: capturar e reenviar
 *    dentro da janela também não funciona;
 *  - o **método, o caminho e o digesto do corpo** dentro do HMAC: trocar o
 *    destino, trocar o verbo ou alterar um byte do corpo invalida a assinatura;
 *  - comparação em **tempo constante**, para não entregar a chave por medição.
 *
 * Toda recusa responde exatamente a mesma coisa: 401, mesmo corpo, mesmo
 * cabeçalho. O motivo real fica no log do operador — qualquer diferença aqui
 * viraria um oráculo do estado do canal.
 */

export const INTERNAL_TS_HEADER = 'x-lola-ts';
export const INTERNAL_NONCE_HEADER = 'x-lola-nonce';
export const INTERNAL_SIG_HEADER = 'x-lola-sig';

/** Chave curta demais é chave fraca: abaixo disso o canal não sobe. */
export const INTERNAL_SECRET_MIN_LENGTH = 32;

const PROTOCOL_VERSION = 'lola-internal-v1';
const DEFAULT_SKEW_MS = 30_000;
const MIN_SKEW_MS = 5_000;
const MAX_SKEW_MS = 300_000;
const DEFAULT_MAX_NONCES = 200_000;
const NONCE_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
const SIGNATURE_PATTERN = /^[0-9a-f]{64}$/i;
// Milissegundos desde a época: 13 dígitos cobrem 2001-2101 sem margem de erro.
const TIMESTAMP_PATTERN = /^\d{13}$/;
const REJECTION_MESSAGE = 'Não autorizado.';

export interface InternalSignInput {
  ts: number;
  nonce: string;
  method: string;
  /** Caminho absoluto exatamente como será enviado, sem query string. */
  path: string;
  body: Buffer;
}

function bodyDigest(body: Buffer): string {
  return createHash('sha256').update(body).digest('hex');
}

/** Cadeia canônica: qualquer diferença em qualquer campo muda o HMAC inteiro. */
function canonicalString(input: InternalSignInput): string {
  return [
    PROTOCOL_VERSION,
    String(input.ts),
    input.nonce,
    input.method.toUpperCase(),
    input.path,
    bodyDigest(input.body),
  ].join('\n');
}

export function signInternalRequest(secret: string, input: InternalSignInput): string {
  return createHmac('sha256', secret).update(canonicalString(input)).digest('hex');
}

/**
 * Monta os cabeçalhos de uma requisição interna assinada.
 *
 * Só é chamado pelo cliente interno, cujo caminho vem de constante — nunca de
 * dado do visitante. A validação do caminho no cliente é defesa em profundidade,
 * não a barreira principal.
 */
export function buildInternalHeaders(
  secret: string,
  input: { method: string; path: string; body: Buffer; now?: number },
): Record<string, string> {
  const ts = input.now ?? Date.now();
  const nonce = randomBytes(16).toString('hex');
  return {
    'content-type': 'application/json',
    [INTERNAL_TS_HEADER]: String(ts),
    [INTERNAL_NONCE_HEADER]: nonce,
    [INTERNAL_SIG_HEADER]: signInternalRequest(secret, { ts, nonce, ...input }),
  };
}

export interface InternalAuthOptions {
  secret: string;
  skewMs?: number;
  maxNonces?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)));
}

/**
 * Middleware de verificação. Requer que o corpo tenha sido capturado **cru**
 * (`express.raw`) — o HMAC é calculado sobre os bytes recebidos, nunca sobre um
 * objeto re-serializado, que poderia diferir do que saiu do cliente.
 */
export function createInternalAuthMiddleware(options: InternalAuthOptions): RequestHandler {
  const secret = (options.secret ?? '').trim();
  // Falha fechada: se o middleware for montado com chave fraca — algo que a
  // subida do servidor já impede, mas que um refactor pode voltar a permitir —
  // o canal inteiro fica recusando em vez de negociar com a chave curtinha.
  if (secret.length < INTERNAL_SECRET_MIN_LENGTH) {
    console.error('[seguranca] Canal interno recusado: LOLA_INTERNAL_SECRET ausente ou curto. '
      + 'Nenhuma requisição interna será aceita até a chave ter 32+ caracteres.');
    return (_req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.status(401).json({ error: REJECTION_MESSAGE });
    };
  }
  const skewMs = clamp(options.skewMs ?? DEFAULT_SKEW_MS, MIN_SKEW_MS, MAX_SKEW_MS);
  const maxNonces = Math.max(1_000, Math.floor(options.maxNonces ?? DEFAULT_MAX_NONCES));
  // Nonces precisam sobreviver a pelo menos uma janela completa para valer como
  // trava de replay; meia janela extra cobre o relógio desalinhado.
  const nonceTtlMs = skewMs * 3;
  const seenNonces = new Map<string, number>();
  // A varredura roda em intervalo fixo, nunca por requisição: varrer o mapa
  // inteiro a cada chamada transformaria o cache de replay num alvo de DoS.
  const sweepIntervalMs = Math.max(1_000, Math.floor(nonceTtlMs / 3));
  let lastSweepAt = 0;
  // Recusa é barata, mas escrever uma linha por requisição recusada não é: um
  // flood não autenticado encheria disco e enterraria o resto do log. Orçamento
  // por segundo, com contagem do que foi suprimido.
  const REJECT_LOG_BUDGET = 20;
  let rejectLogBudget = REJECT_LOG_BUDGET;
  let rejectLogRefillAt = 0;
  let suppressedRejections = 0;

  return (req, res, next) => {
    const reject = (motivo: string) => {
      const at = Date.now();
      if (at >= rejectLogRefillAt) {
        if (suppressedRejections > 0) {
          log('warn', 'interno.requisicao_rejeitada', {
            motivo: 'recusas_suprimidas', quantidade: suppressedRejections,
          });
          suppressedRejections = 0;
        }
        rejectLogBudget = REJECT_LOG_BUDGET;
        rejectLogRefillAt = at + 1_000;
      }
      if (rejectLogBudget > 0) {
        rejectLogBudget -= 1;
        // Caminho truncado: ele vem do atacante e não pode inundar o log.
        const raw = (req.originalUrl || req.url || '/').split('?')[0] ?? '/';
        log('warn', 'interno.requisicao_rejeitada', {
          ip: req.socket.remoteAddress || 'desconhecido',
          metodo: req.method.slice(0, 8),
          caminho: raw.slice(0, 120),
          motivo,
        });
      } else {
        suppressedRejections += 1;
      }
      res.setHeader('Cache-Control', 'no-store');
      return res.status(401).json({ error: REJECTION_MESSAGE });
    };

    // Sem query string: o caminho assinado precisa ser inequívoco. Aceitar
    // `?` abriria uma classe inteira de ambiguidade de normalização.
    const rawUrl = req.originalUrl || req.url || '';
    if (rawUrl.includes('?') || rawUrl.includes('#')) return reject('query_string');
    const requestPath = rawUrl.split('?')[0] ?? '/';
    if (!requestPath.startsWith('/')) return reject('caminho_invalido');

    const tsHeader = req.get(INTERNAL_TS_HEADER) ?? '';
    const nonce = req.get(INTERNAL_NONCE_HEADER) ?? '';
    const provided = req.get(INTERNAL_SIG_HEADER) ?? '';

    // Timestamp primeiro: é a checagem mais barata e descarta relógio fora de
    // janela sem calcular HMAC nenhum.
    if (!TIMESTAMP_PATTERN.test(tsHeader)) return reject('timestamp_formato');
    const ts = Number(tsHeader);
    const now = Date.now();
    if (Math.abs(now - ts) > skewMs) return reject('timestamp_fora_de_janela');

    if (!NONCE_PATTERN.test(nonce)) return reject('nonce_formato');
    if (!SIGNATURE_PATTERN.test(provided)) return reject('assinatura_formato');
    const expiry = now + nonceTtlMs;

    // Corpo: `express.raw` com `type: '*/*'` grava um Buffer. Requisição sem
    // corpo deixa `req.body` como objeto vazio, e um corpo assinado que não foi
    // capturado simplesmente não bate com o vazio — falha fechada.
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

    const expected = Buffer.from(
      signInternalRequest(secret, { ts, nonce, method: req.method, path: requestPath, body }),
      'utf8',
    );
    const actual = Buffer.from(provided, 'utf8');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      return reject('assinatura_invalida');
    }

    // Assinatura válida: só agora o nonce pode ocupar espaço no cache. Um
    // atacante sem a chave não consegue inflá-lo.
    if (seenNonces.has(nonce)) return reject('replay');
    if (now - lastSweepAt >= sweepIntervalMs) {
      for (const [key, expiresAt] of seenNonces) {
        if (expiresAt <= now) seenNonces.delete(key);
      }
      lastSweepAt = now;
    }
    // Falha fechada: se toda a janela está viva e o cache encheu, recusar em vez
    // de evacuar um nonce ainda válido e reabrir o replay. Com 200 mil entradas
    // e TTL de ~90s isso exige milhares de assinaturas válidas por segundo.
    if (seenNonces.size >= maxNonces) return reject('nonce_esgotado');
    seenNonces.set(nonce, expiry);

    return next();
  };
}
