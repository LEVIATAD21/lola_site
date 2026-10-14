import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createJsonErrorHandler } from '../httpError';
import { createSecurityHeadersMiddleware } from '../securityHeaders';

/**
 * VUL-B: o tratador de erro no FIM da cadeia dos dois entrypoints.
 *
 * Sem ele (ou registrado na posição errada), qualquer erro — inclusive o
 * body-parser recusando JSON malformado — escapava para o `finalhandler` do
 * Express, que em não-produção devolve HTML com a stack trace completa:
 * arquivo, linha e trecho de código na resposta. Aqui se testa o tratador
 * REAL (o mesmo que `server.ts` e `data-server.ts` montam), montado na mesma
 * ordem: headers → body parser → rotas → tratador por último.
 */

const servers: Server[] = [];
const errosLogados = () => vi.mocked(console.error).mock.calls.map((call) => String(call[0]));

async function montarApp() {
  const app = express();
  // Mesma ordem do server.ts: headers ANTES do body parser, para que JSON
  // malformado ou corpo gigante também saia protegido.
  app.use(createSecurityHeadersMiddleware({}));
  app.use(express.json({ limit: '16kb' }));

  app.post('/api/pedidos/rascunho', (_req, res) => res.status(201).json({ ok: true }));
  app.get('/api/explosao', (_req, _res, next) => {
    next(new Error('segredo interno: /home/jockerd21/lola_site/.data/orders.key'));
  });
  app.get('/api/erro-nao-erro', (_req, _res, next) => {
    next('texto solto no lugar de um Error');
  });
  app.get('/api/status-413', (_req, _res, next) => next(Object.assign(new Error('grande'), { status: 413 })));
  app.get('/api/status-400', (_req, _res, next) => next(Object.assign(new Error('parse'), { status: 400 })));
  app.get('/api/status-404', (_req, _res, next) => next(Object.assign(new Error('não achou'), { status: 404 })));

  // Por último, como nos dois entrypoints.
  app.use(createJsonErrorHandler());

  const server = app.listen(0, '127.0.0.1');
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

/** Marcas que só existiriam numa stack trace ou num caminho interno. */
const proibidos = /<!doctype|node_modules|\/home\/|\.ts:\d+|at Object|Error:/;

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(servers.splice(0).map((server) =>
    new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  ));
});

describe('createJsonErrorHandler — VUL-B', () => {
  it('POST com JSON malformado devolve 400 application/json e nunca HTML com stack', async () => {
    const base = await montarApp();

    const response = await fetch(base + '/api/pedidos/rascunho', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ "isso": "não fecha',
    });
    const texto = await response.text();

    expect(response.status).toBe(400);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(JSON.parse(texto)).toEqual({ error: 'JSON inválido na requisição.' });
    // O corpo não pode conter NENHUMA marca de stack, caminho ou HTML.
    expect(texto).not.toMatch(proibidos);
  });

  it('corpo acima do limite devolve 413 JSON com a mensagem própria', async () => {
    const base = await montarApp();

    const response = await fetch(base + '/api/pedidos/rascunho', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ inundacao: 'x'.repeat(20_000) }),
    });
    const texto = await response.text();

    expect(response.status).toBe(413);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(JSON.parse(texto)).toEqual({ error: 'Corpo da requisição muito grande.' });
    expect(texto).not.toMatch(proibidos);
  });

  it('erro lançado por uma rota vira 500 genérico, sem vazar caminho nem stack na resposta', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const base = await montarApp();

    const response = await fetch(base + '/api/explosao');
    const texto = await response.text();

    expect(response.status).toBe(500);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(JSON.parse(texto)).toEqual({ error: 'Erro interno do servidor.' });
    expect(texto).not.toMatch(proibidos);
    expect(texto).not.toContain('segredo interno');
    expect(texto).not.toContain('orders.key');
    // VUL-08: o motivo real NÃO se perde — ele existe, mas só no log do
    // operador. Sem isto um incidente seria inexplicável; com ele vazando na
    // resposta seria um oráculo de configuração.
    const linha = errosLogados().find((entry) => entry.includes('http.erro_nao_tratado'));
    expect(linha).toBeTruthy();
    // O logger normaliza espaços em underscores; o motivo tem de estar inteiro.
    expect(linha).toContain('segredo_interno:');
    expect(linha).toContain('orders.key');
    expect(linha).toContain('path=/api/explosao');
  });

  it('erro que nem é Error vira 500 genérico com o motivo no log', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const base = await montarApp();

    const response = await fetch(base + '/api/erro-nao-erro');

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Erro interno do servidor.' });
    const linha = errosLogados().find((entry) => entry.includes('http.erro_nao_tratado'));
    expect(linha).toContain('texto_solto_no_lugar_de_um_Error');
  });

  it('mantém 413 e 400 do erro e converte qualquer outro status em 500', async () => {
    const base = await montarApp();

    const r413 = await fetch(base + '/api/status-413');
    expect(r413.status).toBe(413);
    expect(await r413.json()).toEqual({ error: 'Corpo da requisição muito grande.' });

    const r400 = await fetch(base + '/api/status-400');
    expect(r400.status).toBe(400);
    expect(await r400.json()).toEqual({ error: 'JSON inválido na requisição.' });

    // Status que não é 400/413 não é repassado: a resposta vira 500 genérico
    // em vez de expor o status interno do erro. Documenta o contrato atual.
    const r404 = await fetch(base + '/api/status-404');
    expect(r404.status).toBe(500);
    expect(await r404.json()).toEqual({ error: 'Erro interno do servidor.' });
  });

  it('cabeçalhos de segurança estão presentes até na resposta de erro', async () => {
    const base = await montarApp();

    const response = await fetch(base + '/api/pedidos/rascunho', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ quebrado',
    });

    expect(response.status).toBe(400);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('content-type')).not.toContain('text/html');
  });

  it('JSON malformado não gera linha de erro no log — só 500 loga, senão o flood enche o disco', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const base = await montarApp();

    for (let index = 0; index < 3; index += 1) {
      await fetch(base + '/api/pedidos/rascunho', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{ quebrado',
      });
    }

    expect(errosLogados().filter((entry) => entry.includes('http.erro_nao_tratado'))).toHaveLength(0);
  });
});
