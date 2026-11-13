#!/usr/bin/env node
// Smoke test for the public, read-only Cloudflare Pages catalog.
// Usage: node scripts/smoke-catalog.mjs https://<your-project>.pages.dev
// Do not run this against an authenticated Admin or a private Data Server.
import assert from 'node:assert/strict';

const raw = process.argv[2];
if (!raw) {
  console.error('Uso: node scripts/smoke-catalog.mjs https://<seu-projeto>.pages.dev');
  process.exit(2);
}
let origin;
try {
  const parsed = new URL(raw);
  assert.equal(parsed.protocol, 'https:', 'HTTPS é obrigatório');
  assert.equal(parsed.username, '');
  assert.equal(parsed.password, '');
  assert.equal(parsed.search, '');
  assert.equal(parsed.hash, '');
  assert.equal(parsed.pathname, '/');
  assert.equal(parsed.port, '');
  assert.ok(parsed.hostname.includes('.') && !/^(?:localhost|127\\.|10\\.|192\\.168\\.|169\\.254\\.)/.test(parsed.hostname));
  origin = parsed.origin;
} catch {
  console.error('URL inválida: informe somente a origem pública HTTPS, sem caminhos, credenciais ou query.');
  process.exit(2);
}

async function request(path, init = {}) {
  const response = await fetch(origin + path, {
    ...init,
    redirect: 'manual',
    signal: AbortSignal.timeout(12000),
    headers: { accept: 'application/json, text/html', ...(init.headers ?? {}) },
  });
  if (response.status >= 300 && response.status < 400) throw new Error(path + ': redirecionamento inesperado ' + response.status);
  return response;
}
const checks = [];
async function check(name, action) {
  try {
    await action();
    checks.push({ name, ok: true });
    console.log('OK  ' + name);
  } catch (error) {
    checks.push({ name, ok: false });
    console.error('FALHA ' + name + ': ' + (error instanceof Error ? error.message : 'erro inesperado'));
  }
}

await check('Vitrine HTTPS e CSP', async () => {
  const response = await request('/');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /text\/html/i);
  assert.match(response.headers.get('content-security-policy') ?? '', /script-src 'self'/);
  const text = await response.text();
  assert.match(text, /id=["']root["']/);
});
await check('Políticas de privacidade e cookies públicas', async () => {
  for (const [path, heading] of [
    ['/privacidade/', 'Política de Privacidade'],
    ['/cookies/', 'Política de Cookies'],
  ]) {
    const response = await request(path);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/html/i);
    assert.ok((await response.text()).includes(heading));
  }
});
await check('Health: banco D1 realmente conectado', async () => {
  const response = await request('/api/health');
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.status, 'ok');
  assert.equal(data.database, 'ready');
  assert.equal(data.mode, 'catalog-read-only');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(response.headers.get('content-security-policy') ?? '', /default-src 'none'/);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});
await check('Catálogo seguro e somente leitura', async () => {
  const response = await request('/api/catalog');
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.ok(Array.isArray(data.products));
  assert.ok(data.products.length <= 50);
  for (const product of data.products) {
    assert.ok(typeof product.id === 'string' && product.id);
    assert.ok(typeof product.name === 'string' && product.name);
    assert.ok(typeof product.price === 'number' && Number.isFinite(product.price) && product.price >= 0);
    assert.ok(Number.isSafeInteger(product.disponivel) && product.disponivel >= 0);
    for (const sensitive of ['email', 'phone', 'password', 'admin_key', 'customer_id']) {
      assert.equal(Object.hasOwn(product, sensitive), false);
    }
  }
  if (data.products.length === 0) console.warn('AVISO: catálogo D1 vazio; somente vitrine demonstrativa disponível.');
});
await check('Rota desconhecida não revela estoque', async () => {
  const response = await request('/api/estoque/lola-smoke-never-published-2026');
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
await check('Compras e cobrança permanecem bloqueadas', async () => {
  const response = await request('/api/pedidos/rascunho', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(response.status, 503);
  const data = await response.json();
  assert.equal(data.code, 'CHECKOUT_NOT_CONFIGURED');
});
await check('Deep link do checkout mantém a SPA', async () => {
  const response = await request('/checkout');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /text\/html/i);
  assert.match(await response.text(), /id=["']root["']/);
});

const failed = checks.filter((item) => !item.ok).length;
console.log('\n' + (failed ? 'REPROVADO' : 'APROVADO') + ': ' + (checks.length - failed) + '/' + checks.length + ' verificações.');
if (failed) process.exitCode = 1;
