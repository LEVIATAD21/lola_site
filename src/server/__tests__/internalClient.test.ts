import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { InternalClient } from '../internalClient';

const secret = 'a'.repeat(32);
const servers: Array<Server | http.Server> = [];

async function listen(handler: http.RequestListener): Promise<string> {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.listen(0, '127.0.0.1', resolve);
    server.once('error', reject);
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) =>
    new Promise<void>((resolve) => server.close(() => resolve())),
  ));
});

describe('InternalClient: validação da URL base', () => {
  const rejeitados: Array<[string, string, Record<string, unknown>?]> = [
    ['esquema que não é HTTP', 'ftp://127.0.0.1:4100', {}],
    ['url malformada', 'nao-e-url', {}],
    ['credencial embutida na URL', 'http://user:pass@127.0.0.1:4100', {}],
    ['query string na URL base', 'http://127.0.0.1:4100?x=1', {}],
    ['fragmento na URL base', 'http://127.0.0.1:4100#x', {}],
    ['segredo curto', 'http://127.0.0.1:4100', { secret: 'curto' }],
    // O canal carrega nome, telefone e endereço do cliente: fora de loopback,
    // texto puro só se quem opera disser explicitamente que aceita o risco.
    ['http fora de loopback sem opt-in', 'http://10.0.0.5:4100', {}],
  ];

  for (const [nome, baseUrl, extra] of rejeitados) {
    it(`recusa: ${nome}`, () => {
      expect(() => new InternalClient({
        baseUrl, secret, ...(extra as { secret?: string }),
      })).toThrow();
    });
  }

  it('aceita loopback em http e https em qualquer host', () => {
    expect(() => new InternalClient({ baseUrl: 'http://127.0.0.1:4100', secret })).not.toThrow();
    expect(() => new InternalClient({ baseUrl: 'http://[::1]:4100', secret })).not.toThrow();
    expect(() => new InternalClient({ baseUrl: 'http://localhost:4100', secret })).not.toThrow();
    expect(() => new InternalClient({ baseUrl: 'https://dados.exemplo.test', secret })).not.toThrow();
  });

  it('aceita http fora de loopback apenas com opt-in explícito', () => {
    expect(() => new InternalClient({
      baseUrl: 'http://10.0.0.5:4100', secret, allowPlaintext: true,
    })).not.toThrow();
  });
});

describe('InternalClient: transporte', () => {
  it('entrega a resposta JSON quando tudo está certo', async () => {
    const origin = await listen((_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ stock: { 'brinco-1': 8 } }));
    });
    const client = new InternalClient({ baseUrl: origin, secret });

    const result = await client.call('GET', '/internal/estoque');

    expect(result.ok).toBe(true);
    expect(result.body).toEqual({ stock: { 'brinco-1': 8 } });
  });

  // Um redirect reescreveria o destino que a assinatura cobria.
  it('não segue redirect', async () => {
    const origin = await listen((_req, res) => {
      res.statusCode = 302;
      res.setHeader('location', 'http://127.0.0.1:1/alvo');
      res.end();
    });
    const client = new InternalClient({ baseUrl: origin, secret });

    const result = await client.call('GET', '/internal/estoque');

    expect(result.ok).toBe(false);
    expect(result.body).toBeNull();
  });

  it('recusa resposta que não é JSON', async () => {
    const origin = await listen((_req, res) => {
      res.setHeader('content-type', 'text/html');
      res.end('<html>erro</html>');
    });
    const client = new InternalClient({ baseUrl: origin, secret });

    const result = await client.call('GET', '/internal/estoque');

    expect(result.ok).toBe(false);
    expect(result.failure).toBe('resposta_nao_json');
  });

  it('corta resposta maior que o teto em vez de acumular em memória', async () => {
    const origin = await listen((_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ stock: { x: 'y'.repeat(200_000) } }));
    });
    const client = new InternalClient({ baseUrl: origin, secret });

    const result = await client.call('GET', '/internal/estoque');

    expect(result.ok).toBe(false);
    expect(result.failure).toBe('resposta_grande_demais');
  });

  it('aborta quando o servidor de dados não responde', async () => {
    const origin = await listen(() => { /* nunca responde */ });
    const client = new InternalClient({ baseUrl: origin, secret, timeoutMs: 100 });

    const result = await client.call('GET', '/internal/estoque');

    expect(result.ok).toBe(false);
    expect(result.body).toBeNull();
  });

  it('reporta falha quando o servidor de dados está fora', async () => {
    const client = new InternalClient({ baseUrl: 'http://127.0.0.1:1', secret, timeoutMs: 500 });

    const result = await client.call('GET', '/internal/estoque');

    expect(result.ok).toBe(false);
    expect(result.status).toBe(0);
  });

  // Defesa em profundidade: o chamador só passa constantes, e mesmo assim o
  // caminho é validado para nunca virar vetor de requisição.
  it('recusa caminho interno malicioso sem sequer emitir requisição', async () => {
    let recebidas = 0;
    const origin = await listen(() => { recebidas += 1; });
    const client = new InternalClient({ baseUrl: origin, secret });

    const caminhos = [
      '/internal/../../etc/passwd',
      '/internal/estoque?limit=1',
      '/internal/estoque#x',
      '//evil.test/estoque',
      '/internal/estoque/../estoque',
      'http://evil.test/estoque',
    ];

    for (const path of caminhos) {
      const result = await client.call('GET', path);
      expect(result.ok).toBe(false);
      expect(result.status).toBe(0);
    }
    expect(recebidas).toBe(0);
  });

  it('não envia requisição quando o corpo passa do teto', async () => {
    let recebidas = 0;
    const origin = await listen(() => { recebidas += 1; });
    const client = new InternalClient({ baseUrl: origin, secret });

    const result = await client.call('POST', '/internal/pedidos', { bloco: 'x'.repeat(40_000) });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(413);
    expect(recebidas).toBe(0);
  });
});

describe('InternalClient: Express', () => {
  it('funciona contra uma aplicação Express real', async () => {
    const app = express();
    app.use(express.raw({ type: '*/*', limit: '16kb' }));
    app.get('/internal/estoque', (_req, res) => res.json({ stock: { 'brinco-1': 3 } }));
    const origin = await listen(app);

    const client = new InternalClient({ baseUrl: origin, secret });
    const result = await client.call('GET', '/internal/estoque');

    expect(result.ok).toBe(true);
    expect(result.body).toEqual({ stock: { 'brinco-1': 3 } });
  });
});
