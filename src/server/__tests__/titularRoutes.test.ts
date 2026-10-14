import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAdminRouter } from '../adminRoutes';
import { resolveAdminAllowlist, type AdminAllowlist } from '../ipAllow';
import { createLocalDataPlane, type LocalDataPlane } from '../dataPlane';
import { toAdminOrder } from '../orders';

/**
 * Direitos do titular no painel administrativo (LGPD, art. 18).
 *
 * Cada teste sobe o próprio servidor porque o teto de tentativas
 * administrativas mora no middleware, por instância — compartilhar um único
 * app faria o 11º request do arquivo cair em 429 e mascarar o que se quer testar.
 */

const ADMIN_KEY = 'l'.repeat(48);
const tempDirs: string[] = [];

function tempDirectory() {
  const dir = mkdtempSync(join(tmpdir(), 'lola-lgpd-admin-'));
  tempDirs.push(dir);
  return dir;
}

interface Harness {
  port: number;
  plane: LocalDataPlane;
  server: Server;
}

async function startServer(allowlistRaw = '127.0.0.1'): Promise<Harness> {
  const plane = createLocalDataPlane({
    dataDir: tempDirectory(),
    production: false,
    reservationTtlMs: 60_000,
    encryptionKey: 'ab'.repeat(32),
    retentionDays: 90,
  });
  const allowlist: AdminAllowlist = resolveAdminAllowlist(allowlistRaw);
  const app = express();
  app.use(express.json({ limit: '16kb' }));
  app.use('/api', createAdminRouter({ plane, allowlist }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  return { port: (server.address() as AddressInfo).port, plane, server };
}

function validDraft(phone = '21987654321', fullName = 'Maria da Silva') {
  return {
    customer: {
      fullName, phone, cep: '26300000', street: 'Rua das Flores', number: '123',
      complement: 'Casa 2', neighborhood: 'Centro', city: 'Queimados', state: 'RJ',
    },
    paymentMethod: 'pix',
    shippingOptionId: 'pac',
    giftWrap: false,
    termsAccepted: true,
    items: [{ productId: 'brinco-1', quantity: 1 }],
  };
}

async function call(
  harness: Harness,
  method: string,
  path: string,
  options: { key?: string | null; body?: unknown } = {},
) {
  const headers: Record<string, string> = {};
  if (options.key !== null) headers['x-admin-key'] = options.key ?? ADMIN_KEY;
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`http://127.0.0.1:${harness.port}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  let body: unknown = null;
  try { body = await response.json(); } catch { /* resposta sem corpo */ }
  return { status: response.status, body: body as Record<string, unknown> };
}

/** Cria um pré-pedido de verdade e devolve o número emitido. */
async function seedDraft(harness: Harness, phone = '21987654321', fullName = 'Maria da Silva') {
  const created = await harness.plane.createDraft(validDraft(phone, fullName), { ip: '127.0.0.1' });
  if (created.status !== 201) throw new Error('falha ao semear pré-pedido: ' + JSON.stringify(created.body));
  const order = created.body.order as { orderNumber: string };
  return order.orderNumber;
}

const servers: Harness[] = [];
async function freshServer(allowlistRaw = '127.0.0.1') {
  const harness = await startServer(allowlistRaw);
  servers.push(harness);
  return harness;
}

beforeEach(() => { process.env.LOLA_ADMIN_API_KEY = ADMIN_KEY; });
afterEach(async () => {
  delete process.env.LOLA_ADMIN_API_KEY;
  await Promise.all(servers.splice(0).map(({ server }) =>
    new Promise<void>((resolve) => server.close(() => resolve()))));
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('GET /api/admin/titular — art. 18, I e V', () => {
  it('encontra o titular pelo telefone, sem precisar do número do pedido', async () => {
    const harness = await freshServer();
    const orderNumber = await seedDraft(harness);

    const found = await call(harness, 'GET', '/api/admin/titular?telefone=%2821%29%2098765-4321');
    expect(found.status).toBe(200);
    expect(found.body.count).toBe(1);
    expect(found.body.truncated).toBe(false);
    const orders = found.body.orders as Array<{ orderNumber: string; customer: { fullName: string } }>;
    expect(orders).toHaveLength(1);
    expect(orders[0].orderNumber).toBe(orderNumber);
    expect(orders[0].customer.fullName).toBe('Maria da Silva');
  });

  it('filtra por nome quando o telefone não é conhecido', async () => {
    const harness = await freshServer();
    await seedDraft(harness, '21987654321', 'João da Conceição');
    await seedDraft(harness, '21900000002', 'Ana Souza');

    const byName = await call(harness, 'GET', '/api/admin/titular?nome=JOAO');
    expect(byName.status).toBe(200);
    expect(byName.body.count).toBe(1);

    const noMatch = await call(harness, 'GET', '/api/admin/titular?nome=Ninguem');
    expect(noMatch.status).toBe(200);
    expect(noMatch.body.count).toBe(0);
    expect(noMatch.body.orders).toEqual([]);
  });

  it('recusa busca sem critério: sem telefone nem nome não há o que atender', async () => {
    const harness = await freshServer();
    const empty = await call(harness, 'GET', '/api/admin/titular');
    expect(empty.status).toBe(400);
    const blank = await call(harness, 'GET', '/api/admin/titular?telefone=%20&nome=%20');
    expect(blank.status).toBe(400);
  });

  it('exige a chave administrativa como as demais rotas', async () => {
    const harness = await freshServer();
    const semChave = await call(harness, 'GET', '/api/admin/titular?telefone=21987654321', { key: null });
    expect(semChave.status).toBe(401);
    const chaveErrada = await call(harness, 'GET', '/api/admin/titular?telefone=21987654321', { key: 'x'.repeat(48) });
    expect(chaveErrada.status).toBe(401);
  });

  it('recusa origem fora da allowlist administrativa', async () => {
    const harness = await freshServer('10.9.9.9');
    const denied = await call(harness, 'GET', '/api/admin/titular?telefone=21987654321');
    expect(denied.status).toBe(403);
  });
});

describe('anonimização e eliminação — art. 18, VI', () => {
  it('POST .../redact apaga os dados pessoais e mantém o registro comercial', async () => {
    const harness = await freshServer();
    const orderNumber = await seedDraft(harness);

    const redacted = await call(harness, 'POST', `/api/admin/pre-pedidos/${orderNumber}/redact`);
    expect(redacted.status).toBe(200);
    expect(redacted.body).toMatchObject({ success: true, acao: 'anonimizado' });

    const fetched = await call(harness, 'GET', `/api/admin/pre-pedidos/${orderNumber}`);
    expect(fetched.status).toBe(200);
    const order = fetched.body.order as { customer: Record<string, string>; redacted: boolean; total: number };
    expect(order.redacted).toBe(true);
    expect(order.customer.fullName).toBe('');
    expect(order.customer.phone).toBe('');
    expect(order.customer.street).toBe('');
    expect(order.total).toBeGreaterThan(0);

    // Sai do índice: a busca do titular não devolve mais esta pessoa.
    const search = await call(harness, 'GET', '/api/admin/titular?telefone=21987654321');
    expect(search.status).toBe(200);
    expect(search.body.count).toBe(0);
  });

  it('DELETE .../:orderNumber elimina o registro por inteiro', async () => {
    const harness = await freshServer();
    const orderNumber = await seedDraft(harness);

    const removed = await call(harness, 'DELETE', `/api/admin/pre-pedidos/${orderNumber}`);
    expect(removed.status).toBe(200);
    expect(removed.body).toMatchObject({ success: true, acao: 'eliminado' });

    const gone = await call(harness, 'GET', `/api/admin/pre-pedidos/${orderNumber}`);
    expect(gone.status).toBe(404);

    const search = await call(harness, 'GET', '/api/admin/titular?telefone=21987654321');
    expect(search.body.count).toBe(0);

    // Sumir da busca não basta: o registro tem de sair do arquivo mesmo.
    expect(harness.plane.orders.size).toBe(0);
    expect(harness.plane.orders.hasOrder(orderNumber)).toBe(false);
  });

  it('responde 404 para registro inexistente e 400 para número malformado', async () => {
    const harness = await freshServer();
    const inexistente = await call(harness, 'DELETE', '/api/admin/pre-pedidos/LOLA-99999999-ABCDEF123456');
    expect(inexistente.status).toBe(404);

    const malformado = await call(harness, 'POST', '/api/admin/pre-pedidos/injecao/redact');
    expect(malformado.status).toBe(400);

    const malformadoDelete = await call(harness, 'DELETE', '/api/admin/pre-pedidos/%2e%2e%2fchave');
    expect(malformadoDelete.status).toBe(400);
  });

  it('o pedido anonimizado continua listado para o painel, marcado como tal', async () => {
    const harness = await freshServer();
    const orderNumber = await seedDraft(harness);
    await call(harness, 'POST', `/api/admin/pre-pedidos/${orderNumber}/redact`);

    const list = await call(harness, 'GET', '/api/admin/pre-pedidos?limit=10');
    expect(list.status).toBe(200);
    const orders = list.body.orders as ReturnType<typeof toAdminOrder>[];
    expect(orders).toHaveLength(1);
    expect(orders[0].orderNumber).toBe(orderNumber);
    expect(orders[0].redacted).toBe(true);
    expect(orders[0].customer.fullName).toBe('');
    expect(orders[0].items).toHaveLength(1);
  });
});
