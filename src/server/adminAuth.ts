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
 * Protects privileged server routes with an admin key kept only in the server environment.
 * Use HTTPS in deployed environments; never send this key from browser-side application code.
 */
export function createAdminKeyMiddleware(
  getExpectedKey: AdminKeyProvider = () => process.env.LOLA_ADMIN_API_KEY,
): RequestHandler {
  // Brute-force friction shared across all administrative routes for each remote IP.
  const limitAttempts = createRateLimitMiddleware({
    windowMs: 60_000,
    maxRequests: 10,
    maxBuckets: 10_000,
    keyGenerator: (req) => req.socket.remoteAddress || 'unknown',
    message: 'Muitas tentativas administrativas. Aguarde um minuto e tente novamente.',
  });

  return (req, res, next) => limitAttempts(req, res, () => {
    res.setHeader('Cache-Control', 'no-store');
    const expected = getExpectedKey();

    if (!expected || expected.length < 32) {
      // VUL-11: responder 503 aqui revelava a um atacante externo se a chave
      // administrativa existe no servidor. A resposta passa a ser idêntica à de
      // chave errada; o diagnóstico fica no log e no aviso de subida.
      auditAdminAccess(req, 'not_configured', 'LOLA_ADMIN_API_KEY ausente ou curta');
      return res.status(401).json({ error: ADMIN_UNAVAILABLE_MESSAGE });
    }

    const provided = Buffer.from(req.get('x-admin-key') || '', 'utf8');
    const expectedBuffer = Buffer.from(expected, 'utf8');

    if (provided.length !== expectedBuffer.length || !timingSafeEqual(provided, expectedBuffer)) {
      auditAdminAccess(req, 'denied', 'chave ausente ou inválida');
      return res.status(401).json({ error: ADMIN_UNAVAILABLE_MESSAGE });
    }

    auditAdminAccess(req, 'allow');
    return next();
  });
}
