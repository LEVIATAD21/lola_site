import type { Request, RequestHandler } from 'express';

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  maxBuckets?: number;
  message?: string;
  /** Override the client/route key when a route needs a stricter, documented policy. */
  keyGenerator?: (req: Request) => string;
}

function normalizedRouteKey(req: Request): string {
  // Inline route middleware runs after Express has matched the route, so route.path
  // is canonical even when the incoming URL changes case or has a trailing slash.
  const route = typeof req.route?.path === 'string' ? req.route.path : req.path;
  const base = req.baseUrl || '';
  const combined = (base + '/' + route).toLowerCase().replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  const normalized = combined.replace(/\/+$/, '');
  return normalized || '/';
}

/** Per-process limiter. Multi-instance deployments must also enforce limits in a shared WAF/Redis layer. */
export function createRateLimitMiddleware(options: RateLimitOptions): RequestHandler {
  const windowMs = Math.max(1_000, Math.floor(options.windowMs));
  const maxRequests = Math.max(1, Math.floor(options.maxRequests));
  const maxBuckets = Math.max(100, Math.floor(options.maxBuckets ?? 10_000));
  const message = options.message ?? 'Limite temporário atingido. Tente novamente mais tarde.';
  // req.ip respects Express trust-proxy configuration. By default Express does not
  // trust X-Forwarded-For, so callers cannot spoof their identity via a header.
  const keyGenerator = options.keyGenerator ?? ((req: Request) =>
    (req.ip || req.socket.remoteAddress || 'unknown') + ':' + req.method.toUpperCase() + ':' + normalizedRouteKey(req));
  const buckets = new Map<string, { count: number; resetAt: number }>();
  let lastSweepAt = 0;

  return (req, res, next) => {
    const now = Date.now();
    if (now - lastSweepAt >= windowMs) {
      for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
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
      buckets.delete(key);
      buckets.set(key, current);
      return next();
    }
    if (buckets.size >= maxBuckets) {
      const oldestKey = buckets.keys().next().value;
      if (oldestKey !== undefined) buckets.delete(oldestKey);
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return next();
  };
}
