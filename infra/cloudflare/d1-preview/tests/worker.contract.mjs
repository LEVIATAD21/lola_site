import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { htmlEscape } from '../src/index.js';

const URL_BASE = 'https://preview.example.test';
function fixture(products = []) {
  const queries = [];
  const env = {
    DB: {
      prepare(query) {
        queries.push(query);
        return { async all() { return { success: true, results: products }; } };
      },
    },
  };
  return { env, queries };
}

test('saúde exige vínculo D1 e não inventa sucesso sem DB', async () => {
  const response = await worker.fetch(new Request(URL_BASE + '/api/health'), {});
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: 'unavailable', database: 'not_bound' });
});

test('falha da consulta não expõe stack, erro SQL ou detalhes do banco', async () => {
  const env = { DB: { prepare() { throw new Error('sensitive SQL diagnostic'); } } };
  const response = await worker.fetch(new Request(URL_BASE + '/api/catalog'), env);
  assert.equal(response.status, 503);
  const body = await response.text();
  assert.doesNotMatch(body, /sensitive|stack|SQL diagnostic/);
});

test('saúde responde conectado só depois da consulta real ao binding', async () => {
  const { env, queries } = fixture([]);
  const response = await worker.fetch(new Request(URL_BASE + '/api/health'), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: 'ok', database: 'connected', mode: 'read-only-preview',
  });
  assert.equal(queries.length, 1);
  assert.match(queries[0], /WHERE p.published = 1 AND p.archived_at IS NULL/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('catálogo apresenta somente campos públicos e preço convertido de centavos', async () => {
  const { env } = fixture([{
    id: 'brinco-01', name: 'Brinco inox', category: 'Brincos',
    description: 'Aço inox', price_cents: 12590, disponivel: 4,
    private_customer_phone: '21999999999',
  }]);
  const response = await worker.fetch(new Request(URL_BASE + '/api/catalog'), env);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.products.length, 1);
  assert.deepEqual(data.products[0], {
    id: 'brinco-01', name: 'Brinco inox', category: 'Brincos',
    description: 'Aço inox', price: 125.9, disponivel: 4,
  });
  assert.doesNotMatch(JSON.stringify(data), /21999999999/);
});

test('interface escapa texto exibido e informa checkout desativado', async () => {
  const { env } = fixture([{
    id: 'item-01', name: '<img onerror=alert(1)>', category: 'Brincos',
    description: '', price_cents: 1000, disponivel: 0,
  }]);
  const response = await worker.fetch(new Request(URL_BASE), env);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(html.includes('&lt;img onerror=alert(1)&gt;'));
  assert.ok(!html.includes('<img onerror=alert(1)>'));
  assert.match(html, /checkout.*desativados/);
  assert.match(response.headers.get('content-security-policy') ?? '', /default-src 'none'/);
  assert.equal(htmlEscape('&<>"\''), '&amp;&lt;&gt;&quot;&#39;');
});

test('não há escrita ou rotas financeiras no Worker temporário', async () => {
  const { env, queries } = fixture([]);
  for (const method of ['POST', 'PUT', 'DELETE']) {
    const response = await worker.fetch(new Request(URL_BASE + '/api/catalog', { method }), env);
    assert.equal(response.status, 405);
  }
  const response = await worker.fetch(new Request(URL_BASE + '/api/payments'), env);
  assert.equal(response.status, 404);
  assert.equal(queries.length, 0);
});
