import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InternalClient } from '../internalClient';
import { signInternalResponse } from '../internalAuth';
import { createInternalRouter } from '../internalRoutes';
import { type LocalDataPlane } from '../dataPlane';

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

/** Responde JSON assinado no formato do servidor de dados (nonce + status + corpo). */
function respondSigned(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  status: number,
  body: unknown,
): void {
  const nonce = String(req.headers['x-lola-nonce'] ?? '');
  const raw = Buffer.from(JSON.stringify(body), 'utf8');
  res.writeHead(status, {
    'content-type': 'application/json',
    'x-lola-resp-sig': signInternalResponse(secret, { nonce, status, body: raw }),
  });
  res.end(raw);
}

afterEach(async () => {
  vi.restoreAllMocks();
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
    // Metadata service da nuvem mora em faixa link-local: recusado mesmo em
    // https e mesmo com o opt-in de texto puro, para os dois protocolos.
    ['metadata service em https (link-local)', 'https://169.254.169.254', {}],
    ['metadata service em http com opt-in', 'http://169.254.169.254', { allowPlaintext: true }],
    ['metadata service IPv4-mapeado', 'https://[::ffff:169.254.169.254]', {}],
    ['link-local IPv6', 'https://[fe80::1]', {}],
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
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(() => new InternalClient({
      baseUrl: 'http://10.0.0.5:4100', secret, allowPlaintext: true,
    })).not.toThrow();

    // O aviso é evento estruturado: quem opta por texto puro precisa ver o
    // risco registrado pelo monitor, com o alvo e sem dado pessoal junto.
    const linhas = vi.mocked(console.warn).mock.calls.map((call) => String(call[0]));
    const linha = linhas.find((entry) => entry.includes('interno.canal_texto_puro')) ?? '';
    expect(linha).toContain('WARN');
    expect(linha).toContain('variavel=LOLA_INTERNAL_PLAINTEXT');
    expect(linha).toContain('motivo=http_fora_de_loopback');
    expect(linha).toContain('alvo=http://10.0.0.5:4100');
    expect(linha).toContain('impacto=dado_pessoal_em_claro_durante_o_transito');
    expect(linha).toContain('observacao=assinatura_impede_forja_e_replay_mas_nao_leitura');
  });

  it('loopback em http não registra aviso de texto puro', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(() => new InternalClient({ baseUrl: 'http://127.0.0.1:4100', secret })).not.toThrow();

    expect(
      vi.mocked(console.warn).mock.calls.map((call) => String(call[0]))
        .filter((entry) => entry.includes('interno.canal_texto_puro')),
    ).toHaveLength(0);
  });
});

describe('InternalClient: transporte', () => {
  it('entrega a resposta JSON quando tudo está certo', async () => {
    const origin = await listen((req, res) => {
      respondSigned(req, res, 200, { stock: { 'brinco-1': 8 } });
    });
    const client = new InternalClient({ baseUrl: origin, secret });

    const result = await client.call('GET', '/internal/estoque');

    expect(result.ok).toBe(true);
    expect(result.body).toEqual({ stock: { 'brinco-1': 8 } });
  });

  // A assinatura da resposta amarra o corpo ao nonce da requisição: remover o
  // cabeçalho não adianta, e reusar a assinatura de outra resposta também não.
  it('recusa resposta JSON sem assinatura', async () => {
    const origin = await listen((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ stock: { 'brinco-1': 8 } }));
    });
    const client = new InternalClient({ baseUrl: origin, secret });

    const result = await client.call('GET', '/internal/estoque');

    expect(result.ok).toBe(false);
    expect(result.body).toBeNull();
    expect(result.failure).toBe('assinatura_resposta_invalida');
  });

  it('recusa corpo adulterado mesmo com assinatura de outro corpo', async () => {
    const origin = await listen((req, res) => {
      // O atacante assina legitimamente... para OUTRO corpo, e envia este.
      const nonce = String(req.headers['x-lola-nonce'] ?? '');
      const original = Buffer.from(JSON.stringify({ stock: { 'brinco-1': 8 } }), 'utf8');
      const forjado = Buffer.from(JSON.stringify({ stock: { 'brinco-1': 800 } }), 'utf8');
      res.writeHead(200, {
        'content-type': 'application/json',
        'x-lola-resp-sig': signInternalResponse(secret, { nonce, status: 200, body: original }),
      });
      res.end(forjado);
    });
    const client = new InternalClient({ baseUrl: origin, secret });

    const result = await client.call('GET', '/internal/estoque');

    expect(result.ok).toBe(false);
    expect(result.failure).toBe('assinatura_resposta_invalida');
  });

  it('recusa status adulterado (ex.: 409 virando 201)', async () => {
    const origin = await listen((req, res) => {
      const nonce = String(req.headers['x-lola-nonce'] ?? '');
      const body = Buffer.from(JSON.stringify({ success: true }), 'utf8');
      // Assinado como recusa de negócio; chega como "sucesso".
      res.writeHead(201, {
        'content-type': 'application/json',
        'x-lola-resp-sig': signInternalResponse(secret, { nonce, status: 409, body }),
      });
      res.end(body);
    });
    const client = new InternalClient({ baseUrl: origin, secret });

    const result = await client.call('POST', '/internal/pedidos', {});

    expect(result.ok).toBe(false);
    expect(result.failure).toBe('assinatura_resposta_invalida');
  });

  it('recusa resposta assinada com outra chave', async () => {
    const origin = await listen((req, res) => {
      const nonce = String(req.headers['x-lola-nonce'] ?? '');
      const body = Buffer.from(JSON.stringify({ stock: { 'brinco-1': 8 } }), 'utf8');
      res.writeHead(200, {
        'content-type': 'application/json',
        'x-lola-resp-sig': signInternalResponse('b'.repeat(32), { nonce, status: 200, body }),
      });
      res.end(body);
    });
    const client = new InternalClient({ baseUrl: origin, secret });

    const result = await client.call('GET', '/internal/estoque');

    expect(result.ok).toBe(false);
    expect(result.failure).toBe('assinatura_resposta_invalida');
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

  it('recusa resposta que não é JSON (assinada, mas malformada)', async () => {
    const origin = await listen((req, res) => {
      // Assinatura válida sobre bytes malformados: autenticidade ok, forma não.
      const nonce = String(req.headers['x-lola-nonce'] ?? '');
      const raw = Buffer.from('<html>erro</html>', 'utf8');
      res.writeHead(200, {
        'content-type': 'text/html',
        'x-lola-resp-sig': signInternalResponse(secret, { nonce, status: 200, body: raw }),
      });
      res.end(raw);
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
    app.get('/internal/estoque', (req, res) => respondSigned(req, res, 200, { stock: { 'brinco-1': 3 } }));
    const origin = await listen(app);

    const client = new InternalClient({ baseUrl: origin, secret });
    const result = await client.call('GET', '/internal/estoque');

    expect(result.ok).toBe(true);
    expect(result.body).toEqual({ stock: { 'brinco-1': 3 } });
  });
});

describe('InternalClient: ponta a ponta contra o router real', () => {
  async function startRealRouter(): Promise<string> {
    const plane = {
      snapshot: async () => ({ 'brinco-1': 5 }),
      createDraft: async () => ({ status: 409, body: { error: 'Estoque insuficiente.' } }),
    };
    const app = express();
    app.use('/internal', createInternalRouter({
      plane: plane as unknown as LocalDataPlane,
      secret,
      perMinute: 100,
    }));
    return listen(app);
  }

  it('canal completo funciona com resposta assinada', async () => {
    const origin = await startRealRouter();
    const client = new InternalClient({ baseUrl: origin, secret });

    const result = await client.call('GET', '/internal/estoque');

    expect(result.ok).toBe(true);
    expect(result.body).toEqual({ stock: { 'brinco-1': 5 } });
  });

  // PoC do achado: um atacante na rede privada entre os dois processos repassa
  // a requisição e reescreve o corpo da resposta. Sem assinatura de resposta a
  // vitrine aceitaria estoque forjado; agora a adulteração vira indisponibilidade.
  it('MITM que reescreve o corpo da resposta não passa', async () => {
    const origin = await startRealRouter();
    const upstream = new URL(origin);
    const mitmOrigin = await listen((req, res) => {
      const encaminhada = http.request(
        {
          host: upstream.hostname,
          port: upstream.port,
          path: req.url,
          method: req.method,
          headers: { ...req.headers, host: upstream.host },
        },
        (upstreamRes) => {
          const chunks: Buffer[] = [];
          upstreamRes.on('data', (chunk: Buffer) => chunks.push(chunk));
          upstreamRes.on('end', () => {
            const corpo = Buffer.concat(chunks)
              .toString('utf8')
              .replace('"brinco-1":5', '"brinco-1":999');
            const headers = { ...upstreamRes.headers };
            delete headers['content-length'];
            res.writeHead(upstreamRes.statusCode ?? 502, headers);
            res.end(corpo);
          });
        },
      );
      encaminhada.on('error', () => { res.writeHead(502); res.end(); });
      req.pipe(encaminhada);
    });

    const client = new InternalClient({ baseUrl: mitmOrigin, secret });
    const result = await client.call('GET', '/internal/estoque');

    expect(result.ok).toBe(false);
    expect(result.body).toBeNull();
    expect(result.failure).toBe('assinatura_resposta_invalida');
  });

  // A recusa de negócio (409) também viaja assinada: um MITM não converte
  // "estoque insuficiente" em "pré-pedido confirmado".
  it('MITM que reescreve 409 de pedido em 201 não passa', async () => {
    const origin = await startRealRouter();
    const upstream = new URL(origin);
    const mitmOrigin = await listen((req, res) => {
      const encaminhada = http.request(
        {
          host: upstream.hostname,
          port: upstream.port,
          path: req.url,
          method: req.method,
          headers: { ...req.headers, host: upstream.host },
        },
        (upstreamRes) => {
          const chunks: Buffer[] = [];
          upstreamRes.on('data', (chunk: Buffer) => chunks.push(chunk));
          upstreamRes.on('end', () => {
            const headers = { ...upstreamRes.headers };
            delete headers['content-length'];
            res.writeHead(201, headers);
            res.end(JSON.stringify({ success: true, order: { orderNumber: 'LOLA-20261013-ABCDEF123456' } }));
          });
        },
      );
      encaminhada.on('error', () => { res.writeHead(502); res.end(); });
      req.pipe(encaminhada);
    });

    const client = new InternalClient({ baseUrl: mitmOrigin, secret });
    const result = await client.call('POST', '/internal/pedidos', { cliente: 'sem-dado' });

    expect(result.ok).toBe(false);
    expect(result.failure).toBe('assinatura_resposta_invalida');
  });
});
