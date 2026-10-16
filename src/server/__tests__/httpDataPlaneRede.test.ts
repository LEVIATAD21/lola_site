import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InternalClient } from '../internalClient';
import { HttpDataPlane } from '../httpDataPlane';
import { PEDIDOS_INDISPONIVEL } from '../dataPlane';
import { log } from '../logger';

vi.mock('../logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../logger')>()),
  log: vi.fn(),
}));

/**
 * Modo dividido com a rede DE VERDADE caindo.
 *
 * Os testes do `HttpDataPlane` usam um cliente falso e provam o contrato; aqui
 * o `InternalClient` real chama `fetch` de verdade contra destinos que falham
 * de formas diferentes (conexão recusada, DNS sem resposta, socket cortado no
 * meio do corpo, servidor mudo). O que se protege: NENHUMA dessas falhas pode
 * virar erro lançado para cima da rota, e a mensagem crua do Node
 * (`ECONNREFUSED`, `fetch failed`, `getaddrinfo`...) só pode existir no log do
 * operador — nunca na resposta da vitrine.
 */

const secret = 'a'.repeat(32);
const CATALOGO: ReadonlySet<string> = new Set(['brinco-1', 'brinco-2']);
const VazamentosDeNode = /ECONNREFUSED|ECONNRESET|ENOTFOUND|getaddrinfo|fetch failed|socket hang up|undici|127\.0\.0\.1|AbortError|aborted/i;

const servers: Server[] = [];

/** Porta com nada escutando: conexão recusada na hora. */
async function portaMorta(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = http.createServer();
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo;
      probe.close((error) => (error ? reject(error) : resolve(port)));
    });
    probe.once('error', reject);
  });
}

/** Servidor sob medida para simular a falha de transporte. */
async function servidorFalho(handler: http.RequestListener): Promise<string> {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.listen(0, '127.0.0.1', resolve);
    server.once('error', reject);
  });
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

function montarPlane(baseUrl: string, timeoutMs = 500, allowPlaintext = false) {
  // `allowPlaintext` só no teste de DNS: o canal real é loopback e este host
  // não é — a recusa padrão do constructor já tem teste próprio.
  const client = new InternalClient({ baseUrl, secret, timeoutMs, allowPlaintext });
  return new HttpDataPlane(client, { allowedIds: CATALOGO, ttlMs: 0, staleMs: 0 });
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(servers.splice(0).map((server) =>
    new Promise<void>((resolve) => {
      server.closeAllConnections?.();
      server.close(() => resolve());
    }),
  ));
});

describe('HttpDataPlane com rede falhando de verdade', () => {
  it('conexão recusada vira snapshot null e pré-pedido 503 genérico, sem erro do Node na resposta', async () => {
    const morta = await portaMorta();
    const plane = montarPlane(`http://127.0.0.1:${morta}`);

    // Não pode lançar: a rota da vitrine faria `.catch(() => null)` e o
    // comportamento observável é indisponibilidade, não exceção.
    expect(await plane.snapshot()).toBeNull();

    const resultado = await plane.createDraft({ pedido: 'da-cliente' }, { ip: '203.0.113.9' });
    expect(resultado.status).toBe(503);
    expect(resultado.body).toEqual({ error: PEDIDOS_INDISPONIVEL });

    const serializado = JSON.stringify(resultado);
    expect(serializado).not.toMatch(VazamentosDeNode);
    expect(serializado).not.toContain('da-cliente');
  });

  it('host que não resolve (DNS) vira indisponibilidade, com o motivo preso no timeout', async () => {
    // `.invalid` nunca resolve (RFC 2606). Se o resolver local demorar, o
    // timeout de 500 ms corta — de qualquer forma o desfecho é o mesmo.
    // O aviso de canal em claro continua existindo, agora como evento
    // estruturado: o logger deste teste é mockado, então o alvo da asserção
    // é o próprio `log` (o transporte real em `logger.ts` segue warn→console.warn).
    vi.mocked(log).mockClear();
    const plane = montarPlane('http://nao-existe.invalid:4100', 500, true);
    expect(vi.mocked(log)).toHaveBeenCalledWith(
      'warn',
      'interno.canal_texto_puro',
      expect.objectContaining({ motivo: 'http_fora_de_loopback' }),
    );

    expect(await plane.snapshot()).toBeNull();

    const resultado = await plane.createDraft({ pedido: 'segredo' }, { ip: '203.0.113.9' });
    expect(resultado.status).toBe(503);
    expect(resultado.body).toEqual({ error: PEDIDOS_INDISPONIVEL });
    expect(JSON.stringify(resultado)).not.toMatch(VazamentosDeNode);
    expect(JSON.stringify(resultado)).not.toContain('nao-existe.invalid');
  });

  it('socket cortado no meio do corpo vira indisponibilidade, não JSON pela metade', async () => {
    const base = await servidorFalho((req, res) => {
      // Promete 4 kB e entrega um pedaço: a leitura falha no meio do corpo.
      res.writeHead(200, { 'content-type': 'application/json', 'content-length': '4096' });
      res.write('{"stock": {"brinco-1": 5');
      setTimeout(() => res.destroy(), 10);
    });
    const plane = montarPlane(base);

    expect(await plane.snapshot()).toBeNull();

    const resultado = await plane.createDraft({ pedido: 'x' }, { ip: '203.0.113.9' });
    expect(resultado.status).toBe(503);
    expect(resultado.body).toEqual({ error: PEDIDOS_INDISPONIVEL });
    expect(JSON.stringify(resultado)).not.toMatch(VazamentosDeNode);
  });

  it('servidor que nunca responde é abortado pelo timeout e vira indisponibilidade', async () => {
    const base = await servidorFalho(() => { /* nunca responde */ });
    const plane = montarPlane(base, 150);

    expect(await plane.snapshot()).toBeNull();

    const resultado = await plane.createDraft({ pedido: 'x' }, { ip: '203.0.113.9' });
    expect(resultado.status).toBe(503);
    expect(resultado.body).toEqual({ error: PEDIDOS_INDISPONIVEL });
    expect(JSON.stringify(resultado)).not.toMatch(VazamentosDeNode);
  });

  it('quem falha fica indisponível para o estoque E para o pré-pedido — um sem o outro não basta', async () => {
    // Protege a simetria: um refactor que só tratasse a falha em `snapshot()`
    // deixaria o POST estourar como erro não tratado (500 com log) em vez de
    // 503 de negócio.
    const morta = await portaMorta();
    const plane = montarPlane(`http://127.0.0.1:${morta}`);

    expect(await plane.snapshot()).toBeNull();
    expect((await plane.createDraft({}, { ip: '203.0.113.9' })).status).toBe(503);
    expect((await plane.createDraft({}, { ip: '203.0.113.9' })).status).toBe(503);
  });
});
