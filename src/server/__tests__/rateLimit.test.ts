import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { canonicalPath, createRateLimitMiddleware } from '../rateLimit';

const servers: Server[] = [];

async function startLimitedEndpoint(route = '/limited') {
  const app = express();
  // app.all: parte da suíte faz GET (testes do main) e parte POST (revisão de
  // segurança) — o middleware é indiferente ao método.
  app.all(route, createRateLimitMiddleware({
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

  it('shares one bucket across case and trailing-slash variants handled by the same Express route', async () => {
    const base = await startLimitedEndpoint('/api/pedidos/rascunho');
    const url = base + '/api/pedidos/rascunho';
    expect((await fetch(url, { method: 'POST' })).status).toBe(200);
    expect((await fetch(base + '/API/PEDIDOS/RASCUNHO/', { method: 'POST' })).status).toBe(200);
    const blocked = await fetch(base + '/Api/Pedidos/Rascunho/', { method: 'POST' });
    expect(blocked.status).toBe(429);
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

describe('createRateLimitMiddleware — lotação da tabela', () => {
  /** Limite mínimo do construtor é 100 buckets, então a inundação parte de 99. */
  async function startFloodableEndpoint() {
    const app = express();
    app.get('/limited', createRateLimitMiddleware({
      windowMs: 60_000,
      maxRequests: 2,
      maxBuckets: 100,
      message: 'Sem espaço para um bucket novo',
      keyGenerator: (req) => req.get('x-test-key') || 'default',
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

  // VUL-F: a tabela descartava o bucket mais antigo quando enchia. Um atacante
  // com 5.001 IPs distintos zerava o contador diário de IA de todos os outros
  // clientes — o teto de 400 consultas/dia pagas virava 400 por inundação.
  it('recusa bucket novo quando a tabela está cheia, sem apagar os buckets ativos', async () => {
    const url = await startFloodableEndpoint();
    const hit = (key: string) => fetch(url, { headers: { 'x-test-key': key } });

    // A vítima esgota o próprio teto: o bucket dela fica em primeiro na tabela.
    expect((await hit('vitima')).status).toBe(200);
    expect((await hit('vitima')).status).toBe(200);
    expect((await hit('vitima')).status).toBe(429);

    // 99 IPs distintos completam a tabela (1 da vítima + 99).
    let accepted = 0;
    for (let index = 0; index < 99; index += 1) {
      if ((await hit('inundacao-' + index)).status === 200) accepted += 1;
    }
    expect(accepted).toBe(99);

    // A tabela está cheia: um IP a mais não pode entrar e não pode ejetar ninguém.
    expect((await hit('inundador')).status).toBe(429);

    // O ponto todo: o bucket da vítima NÃO foi zerado pela inundação.
    expect((await hit('vitima')).status).toBe(429);
  });

  it('volta a aceitar bucket novo quando as janelas vencem', async () => {
    const app = express();
    app.get('/short', createRateLimitMiddleware({
      windowMs: 1_000,
      maxRequests: 2,
      maxBuckets: 100,
      keyGenerator: (req) => req.get('x-test-key') || 'default',
    }), (_req, res) => res.json({ ok: true }));

    const server = app.listen(0, '127.0.0.1');
    servers.push(server);
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${address.port}/short`;

    // Enche a tabela com chaves distintas.
    for (let index = 0; index < 100; index += 1) {
      await fetch(url, { headers: { 'x-test-key': 'preencher-' + index } });
    }

    // A recusa falha FECHADA, não para sempre: vencidas as janelas, a varredura
    // libera espaço e um cliente novo entra normalmente.
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    const afterExpiry = await fetch(url, { headers: { 'x-test-key': 'novo-cliente' } });
    expect(afterExpiry.status).toBe(200);
  });
});
