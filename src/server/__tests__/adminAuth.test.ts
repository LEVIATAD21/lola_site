import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createAdminKeyMiddleware } from '../adminAuth';

const expectedKey = 'test-admin-key-that-is-long-enough-123456';
const servers: Server[] = [];

async function startProtectedEndpoint(getKey: () => string | undefined) {
  const app = express();
  let mutations = 0;

  app.post('/api/estoque/atualizar', createAdminKeyMiddleware(getKey), (_req, res) => {
    mutations += 1;
    return res.json({ success: true });
  });

  const server = app.listen(0, '127.0.0.1');
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}/api/estoque/atualizar`,
    mutations: () => mutations,
  };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) =>
    new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  ));
});

describe('createAdminKeyMiddleware', () => {
  it('blocks inventory mutation when no admin key is configured', async () => {
    const endpoint = await startProtectedEndpoint(() => undefined);
    const response = await fetch(endpoint.url, { method: 'POST' });

    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(endpoint.mutations()).toBe(0);
  });

  it('blocks requests without a key or with an incorrect key', async () => {
    const endpoint = await startProtectedEndpoint(() => expectedKey);
    const missing = await fetch(endpoint.url, { method: 'POST' });
    const incorrect = await fetch(endpoint.url, {
      method: 'POST',
      headers: { 'x-admin-key': 'wrong-admin-key' },
    });

    expect(missing.status).toBe(401);
    expect(incorrect.status).toBe(401);
    expect(await missing.json()).toEqual(await incorrect.json());
    expect(endpoint.mutations()).toBe(0);
  });

  it('allows the route only when the exact admin key is supplied', async () => {
    const endpoint = await startProtectedEndpoint(() => expectedKey);
    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: { 'x-admin-key': expectedKey },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(endpoint.mutations()).toBe(1);
  });

  it('does not enable privileged routes when the configured key is too short', async () => {
    const endpoint = await startProtectedEndpoint(() => 'short');
    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: { 'x-admin-key': 'short' },
    });

    expect(response.status).toBe(401);
    expect(endpoint.mutations()).toBe(0);
  });
});


describe('limite de tentativas administrativas', () => {
  it('locks out repeated incorrect key guesses from the same IP', async () => {
    const endpoint = await startProtectedEndpoint(() => expectedKey);
    for (let index = 0; index < 10; index += 1) {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: { 'x-admin-key': `wrong-key-${index}` },
      });
      expect(response.status).toBe(401);
    }
    const blocked = await fetch(endpoint.url, {
      method: 'POST',
      headers: { 'x-admin-key': expectedKey },
    });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBeTruthy();
    expect(endpoint.mutations()).toBe(0);
  });
});
