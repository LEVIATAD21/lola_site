import type { Request, RequestHandler } from 'express';

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  maxBuckets?: number;
  message?: string;
  /** Defaults to socket IP + route path. Do not use untrusted forwarding headers here. */
  keyGenerator?: (req: Request) => string;
}

/** Per-process limiter for a single Node instance. Add shared WAF/Redis limits for multi-instance production. */
export function createRateLimitMiddleware(options: RateLimitOptions): RequestHandler {
  const windowMs = Math.max(1_000, Math.floor(options.windowMs));
  const maxRequests = Math.max(1, Math.floor(options.maxRequests));
  const maxBuckets = Math.max(100, Math.floor(options.maxBuckets ?? 10_000));
  const message = options.message ?? 'Limite temporário atingido. Tente novamente mais tarde.';
  const keyGenerator = options.keyGenerator ?? ((req: Request) =>
    (req.socket.remoteAddress || 'unknown') + ':' + req.path);
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
      const oldestKey = buckets.keys().next().value;
      if (oldestKey !== undefined) buckets.delete(oldestKey);
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return next();
  };
}
