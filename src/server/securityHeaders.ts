import type { RequestHandler } from 'express';

export interface SecurityHeadersOptions {
  production?: boolean;
  enableHsts?: boolean;
  /** Arrasta subdomínios junto. Só use se TODOS eles já estiverem em HTTPS. */
  includeSubDomains?: boolean;
  hstsMaxAgeSeconds?: number;
}

/** Security headers for APIs and the storefront without adding a runtime dependency. */
export function createSecurityHeadersMiddleware(
  options: SecurityHeadersOptions = {},
): RequestHandler {
  // 180 dias por padrão. Um max-age enorme tranca o hostname por anos se algo
  // der errado; um curto demais não vale a visita. Faixa limitada de propósito.
  const maxAge = Math.min(Math.max(Math.floor(options.hstsMaxAgeSeconds ?? 15_552_000), 300), 31_536_000);

  return (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');

    if (options.production) {
      res.setHeader('Content-Security-Policy', [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "form-action 'self'",
        "script-src 'self'",
        // Fontes auto-hospedadas em public/fonts/: as origens do Google saem
        // do CSP — sem elas, um <link> acidental para o CDN não vira fuga de
        // IP em runtime (SUPPLY-CHAIN, achado 3).
        "style-src 'self' 'unsafe-inline'",
        "font-src 'self' data:",
        "img-src 'self' data: blob: https:",
        "connect-src 'self'",
        "manifest-src 'self'",
        "worker-src 'self' blob:",
      ].join('; '));
      // Navegadores ignoram HSTS recebido por HTTP simples, então ligar por
      // padrão só protege; includeSubDomains fica explícito porque quebra
      // subdomínios ainda em HTTP pelo período inteiro do max-age.
      if (options.enableHsts) {
        res.setHeader(
          'Strict-Transport-Security',
          `max-age=${maxAge}${options.includeSubDomains ? '; includeSubDomains' : ''}`,
        );
      }
    }

    return next();
  };
}
