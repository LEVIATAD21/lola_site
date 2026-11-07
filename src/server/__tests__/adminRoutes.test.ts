import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { after, before, describe, expect, it } from 'vitest';
import { createLocalDataPlane } from '../dataPlane';
import { createAdminRouter } from '../adminRoutes';
import { resolveAdminAllowlist } from '../ipAllow';

const HOST = '127.0.0.1';
const KEY = 'test-admin-key-with-at-least-32-characters';
const dir = mkdtempSync(join(tmpdir(), 'lola-admin-routes-'));
const previousKey = process.env.LOLA_ADMIN_API_KEY;
let server: ReturnType<express.Express['listen']>;
let baseUrl = '';
let productId = '';

before(async () => {
  process.env.LOLA_ADMIN_API_KEY = KEY;
  const plane = createLocalDataPlane({
    dataDir: dir,
    production: false,
    reservationTtlMs: 60_000,
    encryptionKey: 'ab'.repeat(32),
  });
  const app = express();
  app.use(express.json({ limit: '16kb' }));
  app.use('/api', createAdminRouter({
    plane,
    allowlist: resolveAdminAllowlist('127.0.0.1'),
  }));
  server = app.listen(0, HOST);
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Servidor de teste sem porta TCP.');
  baseUrl = `http://${HOST}:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  if (previousKey === undefined) delete process.env.LOLA_ADMIN_API_KEY;
  else process.env.LOLA_ADMIN_API_KEY = previousKey;
  rmSync(dir, { recursive: true, force: true });
});

async function call(path: string, init: RequestInit = {}) {
  return fetch(baseUrl + path, {
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });
}
const product = {
  name: 'Produto via API administrativa',
  category: 'Brincos',
  price: 28.5,
  material: 'Aço inox',
  color: 'Prata',
  desc: 'Produto de teste.',
  image: '/images/api-test.webp',
};

describe('Admin API do Data Server — catálogo e estoque', () => {
  it('recusa chave ausente ou incorreta sem revelar configuração', async () => {
    const missing = await call('/api/admin/catalog');
    expect(missing.status).toBe(401);
    const wrong = await call('/api/admin/catalog', { headers: { 'x-admin-key': 'wrong' } });
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual(await missing.json());
  });

  it('cria produto e inicializa registro de estoque', async () => {
    const response = await call('/api/admin/catalog', {
      method: 'POST',
      headers: { 'x-admin-key': KEY },
      body: JSON.stringify(product),
    });
    expect(response.status).toBe(201);
    const data = await response.json();
    productId = data.product.id;
    expect(productId).toMatch(/^prod-[a-f0-9]{16}$/);
  });

  it('lista saldo da autoridade de estoque, não o snapshot auxiliar do catálogo', async () => {
    const adjustment = await call('/api/estoque/definir', {
      method: 'POST',
      headers: { 'x-admin-key': KEY },
      body: JSON.stringify({ productId, quantidade: 11 }),
    });
    expect(adjustment.status).toBe(200);
    const response = await call('/api/admin/catalog', { headers: { 'x-admin-key': KEY } });
    const data = await response.json();
    expect(data.products.find((p: { id: string }) => p.id === productId).disponivel).toBe(11);
  });

  it('recusa categoria inválida e impede exclusão que descartaria saldo físico', async () => {
    const invalid = await call('/api/admin/catalog', {
      method: 'POST',
      headers: { 'x-admin-key': KEY },
      body: JSON.stringify({ ...product, category: 'Acessórios' }),
    });
    expect(invalid.status).toBe(400);

    const deletion = await call('/api/admin/catalog/' + productId, {
      method: 'DELETE',
      headers: { 'x-admin-key': KEY },
    });
    expect(deletion.status).toBe(409);
  });

  it('permite exclusão somente após zerar estoque e preserva integridade', async () => {
    const adjustment = await call('/api/estoque/definir', {
      method: 'POST',
      headers: { 'x-admin-key': KEY },
      body: JSON.stringify({ productId, quantidade: 0 }),
    });
    expect(adjustment.status).toBe(200);
    const deletion = await call('/api/admin/catalog/' + productId, {
      method: 'DELETE',
      headers: { 'x-admin-key': KEY },
    });
    expect(deletion.status).toBe(200);
    const list = await call('/api/admin/catalog', { headers: { 'x-admin-key': KEY } });
    const data = await list.json();
    expect(data.products.some((p: { id: string }) => p.id === productId)).toBe(false);
  });

  it('nega origem fora da allowlist mesmo com a chave correta', async () => {
    // O teste de produção usa a mesma chave e substitui a política de origem
    // por uma que recusa explicitamente o socket do cliente.
    const plane = createLocalDataPlane({
      dataDir: join(dir, 'deny'),
      production: false,
      reservationTtlMs: 60_000,
      encryptionKey: 'cd'.repeat(32),
    });
    const app = express();
    app.use('/api', createAdminRouter({ plane, allowlist: { allowAny: false, check: () => false } }));
    const deniedServer = app.listen(0, HOST);
    await new Promise<void>((resolve) => deniedServer.once('listening', resolve));
    const address = deniedServer.address();
    if (!address || typeof address === 'string') throw new Error('Servidor negado sem porta TCP.');
    try {
      const response = await fetch(`http://${HOST}:${address.port}/api/admin/catalog`, {
        headers: { 'x-admin-key': KEY },
      });
      expect(response.status).toBe(403);
    } finally {
      await new Promise<void>((resolve) => deniedServer.close(() => resolve()));
    }
  });
});
