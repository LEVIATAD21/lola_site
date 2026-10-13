import type { Request, RequestHandler } from 'express';

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  maxBuckets?: number;
  message?: string;
  /** Defaults to proxy-aware client IP + canonical route path. Do not use untrusted forwarding headers here. */
  keyGenerator?: (req: Request) => string;
}

/**
 * Collapse every Express-compatible spelling of a path onto one canonical form.
 *
 * Express matches `/api/pedidos/rascunho`, `/API/PEDIDOS/RASCUNHO` and
 * `/api/pedidos/rascunho/` to the same handler (routing is case-insensitive and
 * non-strict by default), so a key built from the raw `req.path` hands an
 * attacker one fresh bucket per spelling. Canonicalizing removes that bypass.
 */
export function canonicalPath(rawPath: string): string {
  let value = typeof rawPath === 'string' ? rawPath.split('?')[0] ?? '' : '';
  try {
    // %2f, %41, ... must collapse with their literal counterparts.
    value = decodeURIComponent(value);
  } catch {
    // Malformed percent-encoding: keep the raw bytes; they still map consistently.
  }
  value = value.replace(/\\/g, '/');
  const segments: string[] = [];
  for (const segment of value.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  // Express matches routes case-insensitively by default, so `/API/x` and `/api/x`
  // are the same handler and must share one bucket.
  return ('/' + segments.join('/')).toLowerCase();
}

/** Route pattern actually matched by Express, or the raw path when used as `app.use` middleware. */
function routePattern(req: Request): string {
  const route = req.route as { path?: unknown } | undefined;
  const raw = route?.path;
  const pattern = typeof raw === 'string'
    ? raw
    : Array.isArray(raw) && typeof raw[0] === 'string' ? raw[0] : '';
  if (pattern) return canonicalPath((req.baseUrl || '') + pattern);
  return canonicalPath(req.path);
}

/**
 * `req.ip` honours `trust proxy` only when it is explicitly configured, so a
 * forged `X-Forwarded-For` cannot mint a new bucket per request by default.
 */
function clientKey(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/** Shared default: one bucket per client per matched route, immune to path spelling tricks. */
export function defaultKeyGenerator(req: Request): string {
  return clientKey(req) + '|' + routePattern(req);
}

/** Per-process limiter for a single Node instance. Add shared WAF/Redis limits for multi-instance production. */
export function createRateLimitMiddleware(options: RateLimitOptions): RequestHandler {
  const windowMs = Math.max(1_000, Math.floor(options.windowMs));
  const maxRequests = Math.max(1, Math.floor(options.maxRequests));
  const maxBuckets = Math.max(100, Math.floor(options.maxBuckets ?? 10_000));
  const message = options.message ?? 'Limite temporário atingido. Tente novamente mais tarde.';
  const keyGenerator = options.keyGenerator ?? defaultKeyGenerator;
  const buckets = new Map<string, { count: number; resetAt: number }>();
  let lastSweepAt = 0;

  return (req, res, next) => {
    const now = Date.now();
    // Sweep expired entries only once per window, never once per request.
    if (now - lastSweepAt >= windowMs) {
      for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(key);
      }
      lastSweepAt = now;
    }

    const key = keyGenerator(req);
    const current = buckets.get(key);
    if (current && current.resetAt > now) {
      if (current.count >= maxRequests) {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Retry-After', String(Math.max(1, Math.ceil((current.resetAt - now) / 1000))));
        return res.status(429).json({ error: message });
      }
      current.count += 1;
      // LRU-like order keeps eviction bounded under unique-IP floods.
      buckets.delete(key);
      buckets.set(key, current);
      return next();
    }

    if (buckets.size >= maxBuckets) {
      // Varre de novo antes de recusar: uma leva de IPs novos pode encher a
      // tabela entre uma janela canônica e outra.
      let evicted = 0;
      for (const [expiredKey, bucket] of buckets) {
        if (bucket.resetAt <= now) {
          buckets.delete(expiredKey);
          evicted += 1;
        }
      }
      if (evicted === 0 && buckets.size >= maxBuckets) {
        // VUL-F: trocar o bucket mais antigo por um novo era EXATAMENTE o que
        // um inundador queria — 5.001 IPs distintos zeravam o contador diário
        // de IA de todos os outros clientes. Sem espaço livre, a tabela recusa
        // a criação de bucket novo (falha fechada) e os buckets ativos seguem
        // contando. Quem chega depois volta em <= windowMs.
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
        return res.status(429).json({ error: message });
      }
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return next();
  };
}
