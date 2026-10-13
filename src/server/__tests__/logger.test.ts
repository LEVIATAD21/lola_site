import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureIpLogging, createRequestLogger, loggableIp, resolveIpLogMode, truncatePath } from '../logger';

const servers: Server[] = [];
const logged = () => vi.mocked(console.log).mock.calls.map((call) => String(call[0]));
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

async function listen(app: express.Express) {
  const server = app.listen(0, '127.0.0.1');
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

function sampleApp(logger = createRequestLogger()) {
  const app = express();
  app.use(logger);
  app.get('/api/ok', (_req, res) => res.json({ ok: true }));
  app.get('/assets/app.css', (_req, res) => res.type('text/css').send('body{}'));
  return app;
}

afterEach(() => {
  configureIpLogging('mask');
  vi.restoreAllMocks();
  return Promise.all(servers.splice(0).map((server) =>
    new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  ));
});

describe('createRequestLogger', () => {
  it('registra método, caminho e status de cada requisição de API', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const base = await listen(sampleApp());

    await fetch(base + '/api/ok');
    expect((await fetch(base + '/api/ok')).status).toBe(200);
    await settle();

    const lines = logged().filter((line) => line.includes('http.request'));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('method=GET');
    expect(lines[0]).toContain('path=/api/ok');
    expect(lines[0]).toContain('status=200');
    expect(lines[0]).toContain('ip=');
  });

  // VUL-08: o registro não pode virar canal de exfiltração de dados digitados
  // pela cliente nem de PII.
  it('não registra a query string nem dados pessoais', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const base = await listen(sampleApp());

    await fetch(base + '/api/ok?nome=Maria%20da%20Silva&telefone=21999999999');
    await settle();

    const lines = logged();
    expect(lines.some((line) => line.includes('Maria'))).toBe(false);
    expect(lines.some((line) => line.includes('999999999'))).toBe(false);
    expect(lines.some((line) => line.includes('telefone'))).toBe(false);
    expect(lines.some((line) => line.includes('path=/api/ok'))).toBe(true);
  });

  it('ignora arquivos estáticos e a página da vitrine', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const base = await listen(sampleApp());

    await fetch(base + '/assets/app.css');
    await settle();

    expect(logged().filter((line) => line.includes('http.request'))).toHaveLength(0);
  });

  it('limita o volume de linhas para um flood não encher o disco', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const base = await listen(sampleApp(createRequestLogger({ maxPerMinute: 60 })));

    for (let index = 0; index < 90; index += 1) await fetch(base + '/api/ok');
    await settle();

    expect(logged().filter((line) => line.includes('http.request'))).toHaveLength(60);
  });

  // Regressão: o 404 do `/api` roda num middleware montado, que apara `req.url`
  // e não a restaura. Avaliar `req.path` na hora do `finish` registrava o caminho
  // errado e quebrava qualquer correlação de incidente.
  it('registra o caminho completo mesmo quando um middleware montado responde sem restaurar a URL', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const app = express();
    app.use(createRequestLogger());
    app.use('/api', (_req, res) => res.status(404).json({ error: 'não encontrado' }));
    const base = await listen(app);

    expect((await fetch(base + '/api/rota-inexistente')).status).toBe(404);
    await settle();

    const line = logged().find((entry) => entry.includes('http.request'));
    expect(line).toContain('path=/api/rota-inexistente');
    expect(line).toContain('status=404');
  });
});

describe('truncatePath (VUL-L)', () => {
  it('corta caminho longo em 200 caracteres, que é o teto por linha de log', () => {
    const long = '/api/' + 'a'.repeat(16_000);
    const truncated = truncatePath(long);
    expect(truncated.length).toBe(201);
    expect(truncated.startsWith('/api/')).toBe(true);
    expect(truncated.endsWith('…')).toBe(true);
  });

  it('mantém caminhos normais intactos', () => {
    expect(truncatePath('/api/pedidos/rascunho')).toBe('/api/pedidos/rascunho');
    expect(truncatePath('/')).toBe('/');
  });

  it('trata ausência de caminho como raiz, sem lançar', () => {
    expect(truncatePath(undefined)).toBe('/');
    expect(truncatePath('')).toBe('/');
  });

  it('não deixa um path gigante passar pela checagem de prefixo de API', async () => {
    const long = '/api/' + 'a'.repeat(16_000);
    // O logger usa o valor já truncado para decidir se registra: um path longo
    // que comece com /api/ continua sendo tratado como API, e um que não
    // comece continua sendo ignorado — sem depender dos 16 kB inteiros.
    expect(truncatePath(long).startsWith('/api/')).toBe(true);
    expect(('/' + 'b'.repeat(16_000)).startsWith('/api/')).toBe(false);
  });
});

// LGPD: o logger grava IP em três eventos, e IP endereçável é dado pessoal.
// O padrão mascara — preserva padrão de tráfego sem guardar o endereço.
describe('loggableIp (LGPD)', () => {
  it('mascara o host do IPv4 por padrão, mantendo o agregado do provedor', () => {
    configureIpLogging('mask');
    expect(loggableIp('189.45.10.203')).toBe('189.45.x.x');
    expect(loggableIp('127.0.0.1')).toBe('127.0.x.x');
  });

  it('mascara o IPv6 depois dos 4 primeiros grupos', () => {
    configureIpLogging('mask');
    expect(loggableIp('2804:1234:5678:9abc:def0:1111:2222:3333')).toBe('2804:1234:5678:9abc::x');
  });

  it('modo full devolve o endereço inteiro, para quando precisar investigar', () => {
    configureIpLogging('full');
    expect(loggableIp('189.45.10.203')).toBe('189.45.10.203');
  });

  it('modo off remove o campo da linha', () => {
    configureIpLogging('off');
    expect(loggableIp('189.45.10.203')).toBeUndefined();
  });

  it('modo hash não é reversível sem a chave', () => {
    configureIpLogging('hash', 'segredo-da-loja');
    const hashed = loggableIp('189.45.10.203');
    expect(hashed).toMatch(/^ip:[0-9a-f]{12}$/);
    expect(hashed).not.toContain('189');

    // A mesma entrada dá o mesmo token (permite agrupar), a diferente não.
    expect(loggableIp('189.45.10.203')).toBe(hashed);
    expect(loggableIp('189.45.10.204')).not.toBe(hashed);
  });

  it('hash com chave outra não reproduz o mesmo token', () => {
    configureIpLogging('hash', 'chave-a');
    const first = loggableIp('189.45.10.203');
    configureIpLogging('hash', 'chave-b');
    expect(loggableIp('189.45.10.203')).not.toBe(first);
  });

  it('endereço ausente não vira string vazia no log', () => {
    expect(loggableIp(undefined)).toBeUndefined();
    expect(loggableIp('')).toBeUndefined();
  });

  it('valor desconhecido de LOLA_LOG_IP_MODE cai no padrão mascarado', () => {
    expect(resolveIpLogMode('sim')).toBe('mask');
    expect(resolveIpLogMode(undefined)).toBe('mask');
    expect(resolveIpLogMode('')).toBe('mask');
    expect(resolveIpLogMode('full')).toBe('full');
    expect(resolveIpLogMode('hash')).toBe('hash');
    expect(resolveIpLogMode('off')).toBe('off');
    expect(resolveIpLogMode('mask')).toBe('mask');
  });
});
