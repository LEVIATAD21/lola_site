import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createCrossSiteWriteGuard } from '../requestGuard';

const servers: Server[] = [];

/**
 * Reproduz o cenário VUL-E: o limite por rota roda DEPOIS da guarda, então uma
 * requisição cross-site recusada não pode consumir o bucket da vítima.
 */
async function startGuardedEndpoint(limitMax = 2) {
  const app = express();
  let consumed = 0;
  let handled = 0;

  app.use('/api', createCrossSiteWriteGuard());
  app.use('/api', (req, res, next) => {
    consumed += 1;
    return next();
  });
  app.post('/api/pedido', (_req, res) => {
    handled += 1;
    return res.json({ ok: true });
  });

  const server = app.listen(0, '127.0.0.1');
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address() as AddressInfo;
  void limitMax;
  return {
    url: `http://127.0.0.1:${address.port}/api/pedido`,
    bucket: () => consumed,
    handled: () => handled,
  };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) =>
    new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  ));
});

describe('createCrossSiteWriteGuard', () => {
  it('recusa POST com Origin de outro host, sem tocar no bucket de limite', async () => {
    const endpoint = await startGuardedEndpoint();

    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: { 'content-type': 'text/plain', origin: 'https://evil.example' },
      body: '{}',
    });

    expect(response.status).toBe(403);
    expect(response.headers.get('cache-control')).toBe('no-store');
    // O middle de contagem fica DEPOIS da guarda: não pode ter sido alcançado.
    expect(endpoint.bucket()).toBe(0);
    expect(endpoint.handled()).toBe(0);
  });

  it('deixa passar POST same-origin, que é o checkout da própria loja', async () => {
    const endpoint = await startGuardedEndpoint();

    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: new URL(endpoint.url).origin },
      body: '{}',
    });

    expect(response.status).toBe(200);
    expect(endpoint.bucket()).toBe(1);
    expect(endpoint.handled()).toBe(1);
  });

  it('deixa passar cliente sem navegador, que não envia Origin', async () => {
    const endpoint = await startGuardedEndpoint();

    const response = await fetch(endpoint.url, { method: 'POST' });

    expect(response.status).toBe(200);
    expect(endpoint.handled()).toBe(1);
  });

  it('recusa Origin malformado em vez de aceitar por preguiça', async () => {
    const endpoint = await startGuardedEndpoint();

    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: { origin: ':::não é url:::' },
    });

    expect(response.status).toBe(403);
    expect(endpoint.handled()).toBe(0);
  });

  it('recusa Origin com host igual mas esquema diferente', async () => {
    const endpoint = await startGuardedEndpoint();
    const host = new URL(endpoint.url).host;

    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: { origin: `https://${host}` },
      body: '{}',
    });

    expect(response.status).toBe(403);
    expect(endpoint.bucket()).toBe(0);
  });

  it('recusa Origin com host igual ao pedido mas porta diferente', async () => {
    const endpoint = await startGuardedEndpoint();

    const host = new URL(endpoint.url).host;
    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: { origin: `https://${host.replace(/:\d+$/, ':9999')}` },
    });

    expect(response.status).toBe(403);
  });

  it('não barra GET, que não muta estado', async () => {
    const endpoint = await startGuardedEndpoint();

    const response = await fetch(endpoint.url.replace('/pedido', '/pedido'), {
      method: 'GET',
      headers: { origin: 'https://evil.example' },
    });

    // Não existe rota GET aqui, então 404 — mas NÃO 403: a guarda deixou passar.
    expect(response.status).not.toBe(403);
  });
});
