import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildInternalHeaders, createInternalAuthMiddleware, INTERNAL_NONCE_HEADER,
  INTERNAL_RESPONSE_SIG_HEADER, INTERNAL_SIG_HEADER, INTERNAL_TS_HEADER,
  signInternalRequest, signInternalResponse, verifyInternalResponse,
} from '../internalAuth';

const secret = 'a'.repeat(32);
const otherSecret = 'b'.repeat(32);
const servers: Server[] = [];
const linhasDeErro = () => vi.mocked(console.error).mock.calls.map((call) => String(call[0]));

async function startInternalEndpoint(options: { secret?: string; skewMs?: number } = {}) {
  const app = express();
  let reached = 0;

  app.use(express.raw({ type: '*/*', limit: '16kb' }));
  app.use(createInternalAuthMiddleware({
    secret: options.secret ?? secret,
    skewMs: options.skewMs,
  }));

  app.get('/internal/estoque', (req, res) => {
    reached += 1;
    res.json({ ok: true, caminho: 'estoque', corpoBruto: Buffer.isBuffer(req.body) });
  });
  app.post('/internal/pedidos', (req, res) => {
    reached += 1;
    res.json({ ok: true, caminho: 'pedidos' });
  });

  const server = app.listen(0, '127.0.0.1');
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${address.port}`,
    reached: () => reached,
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(servers.splice(0).map((server) =>
    new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  ));
});

describe('canal interno: assinatura', () => {
  it('libera a requisição só quando método, caminho, corpo e assinatura batem', async () => {
    const endpoint = await startInternalEndpoint();
    const body = Buffer.from(JSON.stringify({ produto: 'brinco-1' }), 'utf8');
    const headers = buildInternalHeaders(secret, { method: 'POST', path: '/internal/pedidos', body });

    const response = await fetch(endpoint.origin + '/internal/pedidos', { method: 'POST', headers, body });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, caminho: 'pedidos' });
    expect(endpoint.reached()).toBe(1);
  });

  it('aceita requisição sem corpo, assinando o digesto vazio', async () => {
    const endpoint = await startInternalEndpoint();
    const headers = buildInternalHeaders(secret, {
      method: 'GET', path: '/internal/estoque', body: Buffer.alloc(0),
    });

    const response = await fetch(endpoint.origin + '/internal/estoque', { method: 'GET', headers });

    expect(response.status).toBe(200);
    const payload = await response.json() as { corpoBruto: boolean };
    expect(payload.corpoBruto).toBe(false);
  });
});

describe('canal interno: recusas', () => {
  const cases: Array<{ nome: string; ajustar: (endpoint: { origin: string }) => Promise<Response> }> = [
    {
      nome: 'sem nenhum cabeçalho de assinatura',
      ajustar: (endpoint) => fetch(endpoint.origin + '/internal/estoque'),
    },
    {
      nome: 'assinatura calculada com outra chave',
      ajustar: (endpoint) => {
        const headers = buildInternalHeaders(otherSecret, {
          method: 'GET', path: '/internal/estoque', body: Buffer.alloc(0),
        });
        return fetch(endpoint.origin + '/internal/estoque', { method: 'GET', headers });
      },
    },
    {
      nome: 'assinatura de outro caminho',
      ajustar: (endpoint) => {
        const headers = buildInternalHeaders(secret, {
          method: 'GET', path: '/internal/estoque', body: Buffer.alloc(0),
        });
        return fetch(endpoint.origin + '/internal/pedidos', { method: 'POST', headers, body: '{}' });
      },
    },
    {
      nome: 'assinatura de outro verbo',
      ajustar: (endpoint) => {
        const headers = buildInternalHeaders(secret, {
          method: 'GET', path: '/internal/pedidos', body: Buffer.alloc(0),
        });
        return fetch(endpoint.origin + '/internal/pedidos', { method: 'POST', headers, body: '{}' });
      },
    },
    {
      nome: 'corpo alterado depois de assinar',
      ajustar: (endpoint) => {
        const headers = buildInternalHeaders(secret, {
          method: 'POST', path: '/internal/pedidos', body: Buffer.from('{"produto":"brinco-1"}', 'utf8'),
        });
        return fetch(endpoint.origin + '/internal/pedidos', {
          method: 'POST', headers, body: '{"produto":"brinco-9"}',
        });
      },
    },
    {
      nome: 'query string anexada ao caminho assinado',
      ajustar: (endpoint) => {
        const headers = buildInternalHeaders(secret, {
          method: 'GET', path: '/internal/estoque', body: Buffer.alloc(0),
        });
        return fetch(endpoint.origin + '/internal/estoque?limite=1', { method: 'GET', headers });
      },
    },
    {
      nome: 'timestamp cortado pela janela',
      ajustar: (endpoint) => {
        const headers = buildInternalHeaders(secret, {
          method: 'GET', path: '/internal/estoque', body: Buffer.alloc(0),
          now: Date.now() - 10 * 60_000,
        });
        return fetch(endpoint.origin + '/internal/estoque', { method: 'GET', headers });
      },
    },
    {
      nome: 'timestamp no futuro',
      ajustar: (endpoint) => {
        const headers = buildInternalHeaders(secret, {
          method: 'GET', path: '/internal/estoque', body: Buffer.alloc(0),
          now: Date.now() + 10 * 60_000,
        });
        return fetch(endpoint.origin + '/internal/estoque', { method: 'GET', headers });
      },
    },
    {
      nome: 'timestamp com formato que não é milissegundos',
      ajustar: (endpoint) => {
        const headers = buildInternalHeaders(secret, {
          method: 'GET', path: '/internal/estoque', body: Buffer.alloc(0),
        });
        headers[INTERNAL_TS_HEADER] = '1700000000';
        return fetch(endpoint.origin + '/internal/estoque', { method: 'GET', headers });
      },
    },
    {
      nome: 'nonce com caracteres fora do alfabeto',
      ajustar: (endpoint) => {
        const headers = buildInternalHeaders(secret, {
          method: 'GET', path: '/internal/estoque', body: Buffer.alloc(0),
        });
        headers[INTERNAL_NONCE_HEADER] = 'x'.repeat(4) + '!!';
        return fetch(endpoint.origin + '/internal/estoque', { method: 'GET', headers });
      },
    },
    {
      nome: 'assinatura truncada',
      ajustar: (endpoint) => {
        const headers = buildInternalHeaders(secret, {
          method: 'GET', path: '/internal/estoque', body: Buffer.alloc(0),
        });
        headers[INTERNAL_SIG_HEADER] = headers[INTERNAL_SIG_HEADER].slice(0, 62);
        return fetch(endpoint.origin + '/internal/estoque', { method: 'GET', headers });
      },
    },
    {
      nome: 'nonce reenviado (replay)',
      ajustar: async (endpoint) => {
        const headers = buildInternalHeaders(secret, {
          method: 'GET', path: '/internal/estoque', body: Buffer.alloc(0),
        });
        await fetch(endpoint.origin + '/internal/estoque', { method: 'GET', headers });
        return fetch(endpoint.origin + '/internal/estoque', { method: 'GET', headers });
      },
    },
  ];

  for (const caso of cases) {
    it(`recusa: ${caso.nome}`, async () => {
      const endpoint = await startInternalEndpoint();
      const response = await caso.ajustar(endpoint);
      expect(response.status).toBe(401);
      expect(response.headers.get('cache-control')).toBe('no-store');
      // No replay a primeira passagem é legítima por definição — é justamente
      // por isso que existe o nonce. O ponto é que a segunda não atravessa.
      const primeiraValida = caso.nome.startsWith('nonce reenviado') ? 1 : 0;
      expect(endpoint.reached()).toBe(primeiraValida);
    });
  }

  // Qualquer diferença de corpo entre as recusas seria um oráculo do estado do
  // canal (ex.: "a chave existe mas o nonce já foi usado").
  it('devolve exatamente a mesma resposta para todas as recusas', async () => {
    const endpoint = await startInternalEndpoint();
    const corpos = new Set<string>();
    const status = new Set<number>();

    for (const caso of cases) {
      const response = await caso.ajustar(endpoint);
      status.add(response.status);
      corpos.add(await response.text());
    }

    expect([...status]).toEqual([401]);
    expect(corpos.size).toBe(1);
  });

  it('mantém o canal fechado quando a chave configurada é curta', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const endpoint = await startInternalEndpoint({ secret: 'curta' });
    const headers = buildInternalHeaders('curta', {
      method: 'GET', path: '/internal/estoque', body: Buffer.alloc(0),
    });

    const response = await fetch(endpoint.origin + '/internal/estoque', { method: 'GET', headers });
    expect(response.status).toBe(401);
    expect(endpoint.reached()).toBe(0);
  });

  // A recusa precisa de registro que o monitor acha pelo nome do evento, com
  // contexto suficiente para diagnosticar — e sem levar o segredo junto.
  it('registra a chave curta como interno.chave_rejeitada, sem expor o valor', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const segredoCurto = 'segredo-brevidade-total';

    expect(() => createInternalAuthMiddleware({ secret: segredoCurto })).not.toThrow();

    const linha = linhasDeErro().find((entry) => entry.includes('interno.chave_rejeitada')) ?? '';
    expect(linha).toContain('ERROR');
    expect(linha).toContain('variavel=LOLA_INTERNAL_SECRET');
    expect(linha).toContain('motivo=ausente_ou_curta');
    expect(linha).toContain('tamanho=23');
    expect(linha).toContain('minimo=32');
    expect(linha).toContain('impacto=nenhuma_requisicao_interna_e_aceita');
    expect(linha).not.toContain(segredoCurto);
  });

  it('não é forjável por assinatura válida em texto puro', async () => {
    const endpoint = await startInternalEndpoint();
    const body = Buffer.from('{"produto":"brinco-1"}', 'utf8');
    const valido = buildInternalHeaders(secret, {
      method: 'POST', path: '/internal/pedidos', body,
    });

    // Uma única alteração de bit no corpo deve invalidar tudo.
    const corrompido = Buffer.from(body);
    corrompido[0] = corrompido[0] ^ 0x01;
    const response = await fetch(endpoint.origin + '/internal/pedidos', {
      method: 'POST', headers: valido, body: corrompido,
    });

    expect(response.status).toBe(401);
  });
});

describe('signInternalRequest', () => {
  it('produz HMAC estável e sensível a cada campo', () => {
    const base = {
      ts: 1_700_000_000_000, nonce: 'n'.repeat(32), method: 'GET', path: '/internal/estoque',
      body: Buffer.alloc(0),
    };
    const esperado = signInternalRequest(secret, base);

    expect(signInternalRequest(secret, base)).toBe(esperado);
    expect(signInternalRequest(otherSecret, base)).not.toBe(esperado);
    expect(signInternalRequest(secret, { ...base, method: 'POST' })).not.toBe(esperado);
    expect(signInternalRequest(secret, { ...base, path: '/internal/outro' })).not.toBe(esperado);
    expect(signInternalRequest(secret, { ...base, ts: base.ts + 1 })).not.toBe(esperado);
    expect(signInternalRequest(secret, { ...base, nonce: 'o'.repeat(32) })).not.toBe(esperado);
    expect(signInternalRequest(secret, { ...base, body: Buffer.from('x') })).not.toBe(esperado);
  });

  it('ignora maiúsculas/minúsculas do verbo ao assinar e ao verificar', async () => {
    const endpoint = await startInternalEndpoint();
    const headers = buildInternalHeaders(secret, {
      method: 'get', path: '/internal/estoque', body: Buffer.alloc(0),
    });
    const response = await fetch(endpoint.origin + '/internal/estoque', { method: 'GET', headers });
    expect(response.status).toBe(200);
  });
});

describe('signInternalResponse / verifyInternalResponse', () => {
  const base = { nonce: 'n'.repeat(32), status: 200, body: Buffer.from('{"stock":{}}', 'utf8') };

  it('verifica a assinatura correta e é sensível a cada campo', () => {
    const esperada = signInternalResponse(secret, base);

    expect(verifyInternalResponse(secret, base, esperada)).toBe(true);
    // Nonce de OUTRA requisição: a resposta não pode ser reaproveitada.
    expect(verifyInternalResponse(secret, { ...base, nonce: 'o'.repeat(32) }, esperada)).toBe(false);
    // Status adulterado (ex.: 409 -> 201).
    expect(verifyInternalResponse(secret, { ...base, status: 201 }, esperada)).toBe(false);
    // Um byte de corpo alterado.
    expect(verifyInternalResponse(secret, {
      ...base, body: Buffer.from('{"stock":{"x":1}}', 'utf8'),
    }, esperada)).toBe(false);
    // Outra chave.
    expect(verifyInternalResponse(otherSecret, base, esperada)).toBe(false);
  });

  it('recusa assinatura ausente, malformada ou de outra versão de protocolo', () => {
    const esperada = signInternalResponse(secret, base);

    expect(verifyInternalResponse(secret, base, null)).toBe(false);
    expect(verifyInternalResponse(secret, base, '')).toBe(false);
    expect(verifyInternalResponse(secret, base, 'xx')).toBe(false);
    expect(verifyInternalResponse(secret, base, 'z'.repeat(64))).toBe(false);
    // Uma assinatura de requisição (protocolo v1) nunca valida uma resposta.
    const assinaturaRequisicao = signInternalRequest(secret, {
      ts: Date.now(), nonce: base.nonce, method: 'GET', path: '/internal/estoque', body: Buffer.alloc(0),
    });
    expect(verifyInternalResponse(secret, base, assinaturaRequisicao)).toBe(false);
    expect(esperada).toMatch(/^[0-9a-f]{64}$/);
  });
});
