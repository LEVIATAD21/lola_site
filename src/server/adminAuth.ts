import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { auditAdminAccess } from './logger';
import { createRateLimitMiddleware } from './rateLimit';

export type AdminKeyProvider = () => string | undefined;

/**
 * Resposta única para "chave errada" e "chave não configurada".
 * Ser idêntica nos dois casos é proposital: qualquer diferença vira um oráculo
 * que diz a um atacante externo se existe chave administrativa no servidor.
 */
const ADMIN_UNAVAILABLE_MESSAGE = 'Chave administrativa inválida ou operação não habilitada neste servidor.';

/**
 * Copia o buffer para um vetor de comprimento fixo.
 *
 * A comparação precisa SEMPRE percorrer o mesmo número de bytes, senão o tempo
 * de execução vira um oráculo do comprimento da chave. O trunca-cabeça aqui é
 * inofensivo porque o teste de comprimento abaixo continua mandando rejeitar.
 */
function padToLength(buffer: Buffer, length: number): Buffer {
  if (buffer.length === length) return buffer;
  const padded = Buffer.alloc(length);
  buffer.copy(padded, 0, 0, Math.min(buffer.length, length));
  return padded;
}

/**
 * Protects privileged server routes with an admin key kept only in the server environment.
 * Use HTTPS in deployed environments; never send this key from browser-side application code.
 */
export function createAdminKeyMiddleware(
  getExpectedKey: AdminKeyProvider = () => process.env.LOLA_ADMIN_API_KEY,
): RequestHandler {
  // O tráfego autenticado do BFF é uma única origem IP. Um limite de 10/min
  // para TODAS as operações fazia o painel bloquear suas próprias consultas e
  // atualizações em lote. Separamos volume operacional de tentativas inválidas.
  const limitOperations = createRateLimitMiddleware({
    windowMs: 60_000,
    maxRequests: 300,
    maxBuckets: 10_000,
    keyGenerator: (req) => req.socket.remoteAddress || 'unknown',
    message: 'Limite de operações administrativas atingido. Aguarde um minuto.',
  });
  const failedAttempts = new Map<string, { count: number; resetAt: number }>();
  const MAX_FAILED_ATTEMPTS = 10;
  const FAILURE_WINDOW_MS = 60_000;
  const MAX_FAILURE_BUCKETS = 10_000;

  return (req, res, next) => limitOperations(req, res, () => {
    res.setHeader('Cache-Control', 'no-store');
    const ip = req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    for (const [address, bucket] of failedAttempts) {
      if (bucket.resetAt <= now) failedAttempts.delete(address);
    }
    let failures = failedAttempts.get(ip);
    if (failures && failures.resetAt <= now) {
      failedAttempts.delete(ip);
      failures = undefined;
    }
    if (failures && failures.count >= MAX_FAILED_ATTEMPTS) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((failures.resetAt - now) / 1000))));
      return res.status(429).json({ error: 'Muitas tentativas administrativas. Aguarde um minuto e tente novamente.' });
    }

    const reject = (reason: string) => {
      const bucket = failures ?? { count: 0, resetAt: now + FAILURE_WINDOW_MS };
      bucket.count += 1;
      if (!failures && failedAttempts.size >= MAX_FAILURE_BUCKETS) {
        const oldest = failedAttempts.keys().next().value;
        if (oldest) failedAttempts.delete(oldest);
      }
      failedAttempts.set(ip, bucket);
      auditAdminAccess(req, 'denied', reason);
      return res.status(401).json({ error: ADMIN_UNAVAILABLE_MESSAGE });
    };

    const expected = getExpectedKey();
    if (!expected || expected.length < 32) {
      return reject('LOLA_ADMIN_API_KEY ausente ou curta');
    }

    const provided = Buffer.from(req.get('x-admin-key') || '', 'utf8');
    const expectedBuffer = Buffer.from(expected, 'utf8');

    // As duas checagens rodam SEMPRE sobre buffers de mesmo comprimento.
    const lengthMatches = provided.length === expectedBuffer.length;
    const equal = timingSafeEqual(
      padToLength(provided, expectedBuffer.length),
      padToLength(expectedBuffer, expectedBuffer.length),
    );

    if (!lengthMatches || !equal) {
      return reject('chave ausente ou inválida');
    }

    // Uma autenticação bem-sucedida limpa o contador de falhas do endereço.
    failedAttempts.delete(ip);
    auditAdminAccess(req, 'allow');
    return next();
  });
}
