import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';

export type AdminKeyProvider = () => string | undefined;

/**
 * Protects privileged server routes with an admin key kept only in the server environment.
 * Use HTTPS in deployed environments; never send this key from browser-side application code.
 */
export function createAdminKeyMiddleware(
  getExpectedKey: AdminKeyProvider = () => process.env.LOLA_ADMIN_API_KEY,
): RequestHandler {
  return (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const expected = getExpectedKey();

    if (!expected || expected.length < 32) {
      return res.status(503).json({
        error: 'Operação administrativa desativada. Configure LOLA_ADMIN_API_KEY com pelo menos 32 caracteres.',
      });
    }

    const provided = Buffer.from(req.get('x-admin-key') || '', 'utf8');
    const expectedBuffer = Buffer.from(expected, 'utf8');

    if (provided.length !== expectedBuffer.length || !timingSafeEqual(provided, expectedBuffer)) {
      return res.status(401).json({ error: 'Chave administrativa inválida.' });
    }

    return next();
  };
}
