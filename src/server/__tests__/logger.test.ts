import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequestLogger } from '../logger';

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
