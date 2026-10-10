import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createRateLimitMiddleware } from '../rateLimit';

const servers: Server[] = [];

async function startLimitedEndpoint() {
  const app = express();
  app.get('/limited', createRateLimitMiddleware({
    windowMs: 60_000,
    maxRequests: 2,
    message: 'Too many test requests',
  }), (_req, res) => res.json({ ok: true }));

  const server = app.listen(0, '127.0.0.1');
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}/limited`;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) =>
    new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  ));
});

describe('createRateLimitMiddleware', () => {
  it('returns 429 after the configured number of requests and includes Retry-After', async () => {
    const url = await startLimitedEndpoint();
    expect((await fetch(url)).status).toBe(200);
    expect((await fetch(url)).status).toBe(200);
    const blocked = await fetch(url);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBeTruthy();
    expect(blocked.headers.get('cache-control')).toBe('no-store');
  });

  it('does not trust caller-supplied X-Forwarded-For by default', async () => {
    const url = await startLimitedEndpoint();
    expect((await fetch(url, { headers: { 'x-forwarded-for': '198.51.100.1' } })).status).toBe(200);
    expect((await fetch(url, { headers: { 'x-forwarded-for': '203.0.113.2' } })).status).toBe(200);
    expect((await fetch(url, { headers: { 'x-forwarded-for': '192.0.2.3' } })).status).toBe(429);
  });
});
