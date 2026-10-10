import type { RequestHandler } from 'express';

export interface SecurityHeadersOptions {
  production?: boolean;
  enableHsts?: boolean;
}

/** Security headers for APIs and the storefront without adding a runtime dependency. */
export function createSecurityHeadersMiddleware(
  options: SecurityHeadersOptions = {},
): RequestHandler {
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
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' data: https://fonts.gstatic.com",
        "img-src 'self' data: blob: https:",
        "connect-src 'self'",
        "manifest-src 'self'",
        "worker-src 'self' blob:",
      ].join('; '));
      // Enable only when the production hostname always serves HTTPS.
      if (options.enableHsts) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
    }

    return next();
  };
}
