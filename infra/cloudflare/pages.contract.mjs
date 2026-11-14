import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { onRequest as health } from '../../functions/api/health.js';
import { onRequest as catalog } from '../../functions/api/catalog.js';
import { onRequest as photo } from '../../functions/api/imagens/[id].js';
import { onRequest as stock } from '../../functions/api/estoque/[productId].js';
import { onRequest as blockedOrder } from '../../functions/api/pedidos/rascunho.js';
import { onRequest as assistant } from '../../functions/api/ai/consulta.js';
import { reply } from '../../functions/_shared/publicApi.js';

const BASE = 'https://lola.pages.dev';

test('Pages Functions enforce security headers independent of static _headers', async () => {
  const response = reply({ status: 'ok' });
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(response.headers.get('Cross-Origin-Resource-Policy'), 'same-origin');
  assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow, noarchive');
  assert.equal(response.headers.get('Strict-Transport-Security'), 'max-age=31536000');
  assert.match(response.headers.get('Content-Security-Policy') ?? '', /default-src 'none'/);
  assert.match(response.headers.get('Content-Security-Policy') ?? '', /frame-ancestors 'none'/);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  const refused = await health(ctx('/api/health'));
  assert.equal(refused.status, 503);
  assert.equal(refused.headers.get('Cache-Control'), 'no-store');
  assert.equal(refused.headers.get('Content-Security-Policy'), response.headers.get('Content-Security-Policy'));
});


function stubDB({ rows = [], row = null, error = false } = {}) {
  const calls = [];
  const db = {
    prepare(sql) {
      const call = { sql, bind: [] };
      calls.push(call);
      if (error) throw new Error('secret SQL error: internal_file');
      return {
        bind(...args) {
          call.bind = args;
          return this;
        },
        async all() {
          return { success: true, results: rows };
        },
        async first() {
          if (sql.includes('COUNT(*)')) return { count: rows.length };
          return row;
        },
      };
    },
  };
  return { db, calls };
}

function ctx(path, { db, method = 'GET', params = {} } = {}) {
  return {
    request: new Request(BASE + path, { method }),
    env: db ? { DB: db } : {},
    params,
  };
}

test('saúde não inventa banco existente sem binding ou sem esquema', async () => {
  const missing = await health(ctx('/api/health'));
  assert.equal(missing.status, 503);
  const failing = await health(ctx('/api/health', { db: stubDB({ error: true }).db }));
  assert.equal(failing.status, 503);
  assert.doesNotMatch(await failing.text(), /secret|internal_file|SQL error/);
  const available = await health(ctx('/api/health', { db: stubDB().db }));
  assert.equal(available.status, 200);
  assert.equal((await available.json()).database, 'ready');
});

test('catálogo só mostra campos explicitamente permitidos, mesmo com dados privados do driver', async () => {
  const { db, calls } = stubDB({ rows: [
    { id: 'brinco-1', name: 'Argola', category: 'Brincos',
      description: 'Aço inox', price_cents: 5990, disponivel: 3,
      private_customer_email: 'secret@example.invalid' },
  ] });
  const response = await catalog(ctx('/api/catalog', { db }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.deepEqual(body.products, [{
    id: 'brinco-1', name: 'Argola', category: 'Brincos',
    description: 'Aço inox', price: 59.9, disponivel: 3, image: null,
  }]);
  assert.doesNotMatch(JSON.stringify(body), /secret@example.invalid/);
  assert.match(calls[0].sql, /p.published = 1 AND p.archived_at IS NULL/);
  assert.match(calls[0].sql, /LIMIT 50/);
});

test('estoque respeita disponibilidade real e não aceita IDs inválidos', async () => {
  const { db, calls } = stubDB({ row: { id: 'brinco-1', disponivel: 2 } });
  const valid = await stock(ctx('/api/estoque/brinco-1', { db, params: { productId: 'brinco-1' } }));
  assert.equal(valid.status, 200);
  assert.deepEqual(await valid.json(), { productId: 'brinco-1', disponivel: 2 });
  assert.deepEqual(calls[0].bind, ['brinco-1']);
  const invalid = await stock(ctx('/api/estoque/x', {
    db, params: { productId: 'anything? OR 1=1' },
  }));
  assert.equal(invalid.status, 400);
  assert.equal(calls.length, 1);
});

test('produto não publicado ou sem estoque no banco falha fechado', async () => {
  const { db } = stubDB({ row: null });
  const response = await stock(ctx('/api/estoque/brinco-999', { db, params: { productId: 'brinco-999' } }));
  assert.equal(response.status, 404);
});

test('a vitrine em Pages não registra pedido falso nem aceita compra sem backend', async () => {
  const request = ctx('/api/pedidos/rascunho', { method: 'POST' });
  const response = await blockedOrder(request);
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.code, 'CHECKOUT_NOT_CONFIGURED');
});

test('requisições de escrita do público não mudam o catálogo', async () => {
  const { db, calls } = stubDB({ rows: [] });
  for (const endpoint of [
    [health, '/api/health'],
    [catalog, '/api/catalog'],
    [stock, '/api/estoque/brinco-1'],
  ]) {
    const response = await endpoint[0](ctx(endpoint[1], {
      db, method: 'POST', params: { productId: 'brinco-1' },
    }));
    assert.equal(response.status, 405);
  }
  assert.equal(calls.length, 0);
});

test('assistente local não usa serviço pago, não confirma cobrança nem ecoa PII', async () => {
  const request = new Request(BASE + '/api/ai/consulta', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pergunta: 'Quero pagar com Pix, meu cartão é 4111111111111111' }),
  });
  const result = await assistant({ request, env: {} });
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.match(body.resposta, /pagamento.*prepara[cç][aã]o|compra.*prepara[cç][aã]o/i);
  assert.doesNotMatch(JSON.stringify(body), /4111111111111111/);
  assert.ok(body.referencias.every((ref) => ref.link.startsWith('/')));
});

test('assistente local rejeita payload grande, JSON inválido e método GET', async () => {
  const oversize = new Request(BASE + '/api/ai/consulta', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pergunta: 'x'.repeat(6000) }),
  });
  assert.equal((await assistant({ request: oversize })).status, 413);
  const malformed = new Request(BASE + '/api/ai/consulta', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: '{not-json',
  });
  assert.equal((await assistant({ request: malformed })).status, 400);
  const get = new Request(BASE + '/api/ai/consulta', { method: 'GET' });
  assert.equal((await assistant({ request: get })).status, 405);
});

test('Pages publica CSP restritiva e não permite script inline nem envio cross-origin', () => {
  const headers = readFileSync(new URL('../../public/_headers', import.meta.url), 'utf8');
  assert.match(headers, /Content-Security-Policy: default-src 'self';/);
  assert.match(headers, /script-src 'self';/);
  assert.match(headers, /connect-src 'self';/);
  assert.match(headers, /frame-ancestors 'none';/);
  assert.match(headers, /base-uri 'self';/);
  assert.match(headers, /X-Content-Type-Options: nosniff/);
  assert.doesNotMatch(headers, /script-src[^;]*unsafe-inline/);
  assert.doesNotMatch(headers, /Access-Control-Allow-Origin:\\s*\\*/);
});


test('foto pública exige publicação no DB e bytes no PHOTOS_DB', async () => {
  const {db} = stubDB({row:null});
  const notFound = await photo({
    ...ctx('/api/imagens/brinco-1', {db,params:{id:'brinco-1'}}),
    env:{DB:db, PHOTOS_DB:stubDB({row:null}).db},
  });
  assert.equal(notFound.status,404);
  const invalid = await photo(ctx('/api/imagens/invalid%2Fname', {
    db,params:{id:'invalid/name'},
  }));
  assert.equal(invalid.status,404);
  const noDb=await photo(ctx('/api/imagens/brinco-1',{db,params:{id:'brinco-1'}}));
  assert.equal(noDb.status,503);
});
test('foto publicada usa PHOTOS_DB, sem cache para apagar imediatamente', async () => {
  const catalog=stubDB({row:{id:'brinco-1'}});
  const photoStore=stubDB({row:{mime_type:'image/webp',bytes:Array(28).fill(1)}});
  const response=await photo({
    ...ctx('/api/imagens/brinco-1',{db:catalog.db,params:{id:'brinco-1'}}),
    env:{DB:catalog.db,PHOTOS_DB:photoStore.db},
  });
  assert.equal(response.status,200);
  assert.equal(response.headers.get('content-type'),'image/webp');
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal((await response.arrayBuffer()).byteLength,28);
  assert.match(catalog.calls[0].sql,/p.published=1/);
  assert.match(photoStore.calls[0].sql,/FROM product_photos/);
});
