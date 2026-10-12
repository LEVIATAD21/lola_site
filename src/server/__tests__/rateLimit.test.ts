import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { canonicalPath, createRateLimitMiddleware } from '../rateLimit';

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
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) =>
    new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  ));
});

describe('createRateLimitMiddleware', () => {
  it('returns 429 after the configured number of requests and includes Retry-After', async () => {
    const base = await startLimitedEndpoint();
    const url = base + '/limited';
    expect((await fetch(url)).status).toBe(200);
    expect((await fetch(url)).status).toBe(200);
    const blocked = await fetch(url);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBeTruthy();
    expect(blocked.headers.get('cache-control')).toBe('no-store');
  });

  it('does not trust caller-supplied X-Forwarded-For by default', async () => {
    const base = await startLimitedEndpoint();
    const url = base + '/limited';
    expect((await fetch(url, { headers: { 'x-forwarded-for': '198.51.100.1' } })).status).toBe(200);
    expect((await fetch(url, { headers: { 'x-forwarded-for': '203.0.113.2' } })).status).toBe(200);
    expect((await fetch(url, { headers: { 'x-forwarded-for': '192.0.2.3' } })).status).toBe(429);
  });

  // VUL-01: every spelling Express routes to the same handler must share one bucket.
  it('keeps a single bucket across case, trailing-slash and query-string variants of one route', async () => {
    const base = await startLimitedEndpoint();
    const variants = ['/limited', '/LIMITED', '/Limited', '/limited/', '/LIMITED/', '/limited?x=1', '/LIMITED?overflow=1'];

    let accepted = 0;
    for (const variant of variants) {
      if ((await fetch(base + variant)).status === 200) accepted += 1;
    }
    expect(accepted).toBe(2);

    // Every remaining spelling must now be blocked instead of minting a fresh bucket.
    for (const variant of variants) {
      expect((await fetch(base + variant)).status).toBe(429);
    }
  });

  it('does not let a second bucket be opened by an unrelated spelling after lockout', async () => {
    const base = await startLimitedEndpoint();
    const url = base + '/limited';
    expect((await fetch(url)).status).toBe(200);
    expect((await fetch(url)).status).toBe(200);
    expect((await fetch(url)).status).toBe(429);
    expect((await fetch(base + '/limited/')).status).toBe(429);
    expect((await fetch(base + '/LIMITED')).status).toBe(429);
  });
});

describe('canonicalPath', () => {
  it('folds case, duplicate slashes, trailing slash, dot segments and query strings', () => {
    expect(canonicalPath('/api/pedidos/rascunho')).toBe('/api/pedidos/rascunho');
    expect(canonicalPath('/api/pedidos/rascunho/')).toBe('/api/pedidos/rascunho');
    expect(canonicalPath('/API/PEDIDOS/RASCUNHO')).toBe('/api/pedidos/rascunho');
    expect(canonicalPath('/api//pedidos///rascunho')).toBe('/api/pedidos/rascunho');
    expect(canonicalPath('/api/pedidos/./rascunho')).toBe('/api/pedidos/rascunho');
    expect(canonicalPath('/api/pedidos/../../api/pedidos/rascunho')).toBe('/api/pedidos/rascunho');
    expect(canonicalPath('/api/pedidos/rascunho?limit=1')).toBe('/api/pedidos/rascunho');
    expect(canonicalPath('/api/pedidos/%72ascunho')).toBe('/api/pedidos/rascunho');
    expect(canonicalPath('/api/pedidos/rascunho%2f')).toBe('/api/pedidos/rascunho');
    expect(canonicalPath('')).toBe('/');
    expect(canonicalPath('//')).toBe('/');
    expect(canonicalPath('/')).toBe('/');
  });

  it('survives malformed percent-encoding without throwing', () => {
    expect(canonicalPath('/api/%zz')).toBe('/api/%zz');
    expect(() => canonicalPath('/%E0%A4%A')).not.toThrow();
  });
});
