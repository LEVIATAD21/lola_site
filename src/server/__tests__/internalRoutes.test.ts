import express from 'express';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildInternalHeaders, INTERNAL_NONCE_HEADER, INTERNAL_RESPONSE_SIG_HEADER, verifyInternalResponse,
} from '../internalAuth';
import { createInternalRouter } from '../internalRoutes';
import { type LocalDataPlane } from '../dataPlane';

const secret = 'a'.repeat(32);
const servers: Server[] = [];

/** Plano falso: este arquivo testa o encanamento do router, não o estoque. */
function fakePlane(
  resposta: { status: number; body: Record<string, unknown> },
  tracking?: Record<string, unknown>,
  orderExists = true,
) {
  return {
    snapshot: async () => ({ 'brinco-1': 5 }),
    createDraft: async () => resposta,
    tracking: { ready: true, lookup: () => tracking ?? null },
    orders: { findByOrderNumber: () => orderExists ? ({ orderNumber: 'LOLA-20261011-ABCDEF123456' }) : undefined },
  } as unknown as LocalDataPlane;
}

async function startServer(perMinute: number, plane = fakePlane({ status: 409, body: { error: 'Estoque insuficiente.' } })) {
  const app = express();
  app.use('/internal', createInternalRouter({
    plane,
    secret,
    perMinute,
  }));
  const server = app.listen(0, '127.0.0.1');
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  return (server.address() as AddressInfo).port;
}

async function call(port: number, method: string, path: string, body = '') {
  const payload = Buffer.from(body, 'utf8');
  const assinaturaRequest = buildInternalHeaders(secret, { method, path, body: payload });
  const headers: Record<string, string> = {
    ...assinaturaRequest,
    'content-type': 'application/json',
  };
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method, headers, body: method === 'GET' ? undefined : payload,
  });
  return {
    status: response.status,
    body: await response.text(),
    nonce: assinaturaRequest[INTERNAL_NONCE_HEADER] ?? '',
    respSig: response.headers.get(INTERNAL_RESPONSE_SIG_HEADER),
  };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) =>
    new Promise<void>((resolve) => server.close(() => resolve())),
  ));
});

describe('internalRoutes: teto por origem, não por caminho inventado', () => {
  it('assinatura válida passa (controle) e a resposta vem assinada', async () => {
    const port = await startServer(10);
    const resposta = await call(port, 'GET', '/internal/estoque');
    expect(resposta.status).toBe(200);
    expect(resposta.body).toContain('brinco-1');
    // O sentido de volta também é autenticado: nonce da requisição + status + corpo.
    expect(resposta.respSig).toBeTruthy();
    expect(verifyInternalResponse(secret, {
      nonce: resposta.nonce,
      status: resposta.status,
      body: Buffer.from(resposta.body, 'utf8'),
    }, resposta.respSig)).toBe(true);
  });

  it('consulta rastreamento pelo canal assinado e devolve apenas dados logísticos', async () => {
    const token = 'a'.repeat(43);
    const tracking = {
      orderNumber: 'LOLA-20261011-ABCDEF123456',
      carrierCode: null,
      status: 'preparing',
      events: [{
        id: 'evt-1', status: 'preparing', title: 'Pedido sendo preparado',
        description: 'Atualização registrada pela loja.',
        occurredAt: '2026-11-07T12:00:00.000Z', source: 'store',
      }],
      updatedAt: '2026-11-07T12:00:00.000Z',
    };
    const port = await startServer(10, fakePlane({ status: 200, body: {} }, tracking));
    const resposta = await call(port, 'GET', '/internal/rastreio/' + token);
    expect(resposta.status).toBe(200);
    expect(resposta.body).toContain('LOLA-20261011-ABCDEF123456');
    expect(resposta.respSig).toBeTruthy();
    expect(verifyInternalResponse(secret, {
      nonce: resposta.nonce,
      status: resposta.status,
      body: Buffer.from(resposta.body, 'utf8'),
    }, resposta.respSig)).toBe(true);
  });

  it('não expõe rastreamento quando o pedido não existe mais', async () => {
    const token = 'b'.repeat(43);
    const tracking = {
      orderNumber: 'LOLA-20261011-ABCDEF123456', carrierCode: null, status: 'preparing',
      events: [], updatedAt: '2026-11-07T12:00:00.000Z',
    };
    const port = await startServer(10, fakePlane({ status: 200, body: {} }, tracking, false));
    const resposta = await call(port, 'GET', '/internal/rastreio/' + token);
    expect(resposta.status).toBe(404);
  });

  it('resposta de erro do plano de dados também vem assinada', async () => {
    const port = await startServer(10);
    const resposta = await call(port, 'POST', '/internal/pedidos', '{}');
    expect(resposta.status).toBe(409);
    expect(verifyInternalResponse(secret, {
      nonce: resposta.nonce,
      status: resposta.status,
      body: Buffer.from(resposta.body, 'utf8'),
    }, resposta.respSig)).toBe(true);
  });

  it('chega no teto e recusa', async () => {
    const port = await startServer(2);
    expect((await call(port, 'GET', '/internal/estoque')).status).toBe(200);
    expect((await call(port, 'GET', '/internal/estoque')).status).toBe(200);
    expect((await call(port, 'GET', '/internal/estoque')).status).toBe(429);
  });

  it('caminho inventado sob /internal disputa o mesmo balde da origem', async () => {
    // O rate limit roda em `router.use`, então alcança qualquer caminho sob o
    // prefixo — inclusive os que não existem. Se a chave incluísse o caminho,
    // um atacante na rede privada inventando rota nova abriria balde novo a
    // cada requisição e dobraria a permissão à vontade.
    const port = await startServer(3);
    await call(port, 'GET', '/internal/estoque');
    await call(port, 'GET', '/internal/estoque');
    await call(port, 'GET', '/internal/estoque');

    const inventado = await call(port, 'GET', '/internal/' + randomUUID());
    expect(inventado.status).toBe(429);
  });

  it('o teto vale para a escrita também', async () => {
    const port = await startServer(1);
    expect((await call(port, 'POST', '/internal/pedidos', '{}')).status).toBe(409);
    expect((await call(port, 'POST', '/internal/pedidos', '{}')).status).toBe(429);
  });

  it('assinatura errada não passa mesmo antes do teto', async () => {
    const port = await startServer(5);
    const response = await fetch(`http://127.0.0.1:${port}/internal/estoque`, {
      method: 'GET',
      headers: { ...buildInternalHeaders('b'.repeat(32), {
        method: 'GET', path: '/internal/estoque', body: Buffer.alloc(0),
      }) },
    });
    expect(response.status).toBe(401);
  });

  it('caminho com barra final não casa com o assinado', async () => {
    const port = await startServer(5);
    const headers = buildInternalHeaders(secret, {
      method: 'GET', path: '/internal/estoque', body: Buffer.alloc(0),
    });
    const response = await fetch(`http://127.0.0.1:${port}/internal/estoque/`, { headers });
    expect(response.status).toBe(401);
  });
});
