// Diagnóstico operacional temporário da LOLA sobre Workers + D1.
// NÃO é checkout e NÃO substitui o Data Server transacional.
// Rotas de leitura apenas: nenhum POST, PUT, DELETE, credencial ou dado pessoal.

const JSON_HEADERS = Object.freeze({
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
});

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extra },
  });
}

function htmlEscape(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

const number = (value) => Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : 0;

function layout(products) {
  const total = products.length;
  const rows = products.map((product) => {
    const price = (product.price_cents / 100).toLocaleString('pt-BR', {
      style: 'currency', currency: 'BRL',
    });
    return '<tr><td>' + htmlEscape(product.name) + '</td><td>' +
      htmlEscape(product.category) + '</td><td>' + htmlEscape(price) +
      '</td><td>' + String(number(product.disponivel)) + '</td></tr>';
  }).join('');
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>LOLA — Verificação de conectividade D1</title>
  <style>
    :root{color-scheme:dark;font-family:system-ui,-apple-system,sans-serif}
    body{background:#111115;color:#f9f6f7;margin:0;min-height:100vh}
    main{max-width:760px;margin:5vh auto;padding:24px}
    h1{font-size:clamp(1.5rem,5vw,2.5rem);margin:.5rem 0}
    p{line-height:1.65;color:#bdbac1}
    .eyebrow{color:#fb6a79;letter-spacing:.14em;text-transform:uppercase;font-size:.75rem;font-weight:700}
    .panel{background:#1d1d24;border:1px solid #32313c;border-radius:18px;padding:26px;margin:22px 0}
    .ready{font-weight:700;color:#78ddac}
    .count{font-size:2.5rem;font-weight:800}
    table{border-collapse:collapse;width:100%;text-align:left;overflow:hidden}
    td,th{padding:12px 8px;border-bottom:1px solid #34333c;font-size:.9rem}
    th{color:#a9a5b1}
    .table-wrap{overflow-x:auto}
    .muted{font-size:.875rem}
    code{color:#ff9da7}
  </style>
</head>
<body><main>
  <p class="eyebrow">LOLA Aço Inox • Diagnóstico da infraestrutura</p>
  <h1>Cloudflare Worker + Banco D1</h1>
  <section class="panel" aria-label="Estado da conexão">
    <div class="ready">● Banco D1 conectado e consultado</div>
    <p>O Worker executou uma consulta real ao banco vinculado. Nenhum dado fictício foi inserido.</p>
    <div class="count">${total}</div>
    <div class="muted">Produtos publicados exibidos (máximo 50)</div>
  </section>
  <section class="panel">
    <h2>Catálogo publicado</h2>
    ${total
      ? `<div class="table-wrap"><table><thead><tr><th>Produto</th><th>Categoria</th><th>Preço</th><th>Disponível</th></tr></thead><tbody>${rows}</tbody></table></div>`
      : '<p>Nenhum produto publicado neste banco. Isso é esperado em um banco recém-criado e vazio.</p>'}
  </section>
  <p class="muted">Somente leitura. Cadastro, checkout, pedidos, Pix e cartão permanecem desativados nesta visualização.</p>
  <p class="muted">Monitoramento: <code>GET /api/health</code> • Catálogo: <code>GET /api/catalog</code></p>
</main></body></html>`;
}

async function publishedProducts(db) {
  const result = await db.prepare(
    `SELECT p.id, p.name, p.category, p.description, p.price_cents,
        COALESCE(i.quantity_on_hand - i.quantity_reserved, 0) AS disponivel
     FROM products p
     LEFT JOIN inventory i ON i.product_id = p.id
     WHERE p.published = 1 AND p.archived_at IS NULL
     ORDER BY p.category COLLATE NOCASE, p.name COLLATE NOCASE, p.id
     LIMIT 50`,
  ).all();
  if (!result?.success || !Array.isArray(result.results)) throw new Error('D1 query failed.');
  return result.results.map((item) => ({
    id: String(item.id),
    name: String(item.name),
    category: String(item.category),
    description: String(item.description || ''),
    price_cents: number(item.price_cents),
    disponivel: number(item.disponivel),
  }));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const allowed = new Set(['/', '/api/health', '/api/catalog']);
    if (!allowed.has(url.pathname)) return json({ error: 'Recurso não encontrado.' }, 404);
    if (request.method !== 'GET') return json({ error: 'Método não permitido.' }, 405, { allow: 'GET' });
    if (!env || !env.DB || typeof env.DB.prepare !== 'function') {
      return json({ status: 'unavailable', database: 'not_bound' }, 503);
    }
    try {
      // Consulta de verdade: também valida que a migração foi aplicada.
      const products = await publishedProducts(env.DB);
      if (url.pathname === '/api/health') {
        return json({ status: 'ok', database: 'connected', mode: 'read-only-preview' });
      }
      if (url.pathname === '/api/catalog') {
        return json({
          products: products.map((p) => ({
            id: p.id, name: p.name, category: p.category,
            description: p.description, price: p.price_cents / 100,
            disponivel: p.disponivel,
          })),
          pagination: { returned: products.length, limit: 50 },
          mode: 'read-only-preview',
        });
      }
      return new Response(layout(products), {
        status: 200,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
          'x-frame-options': 'DENY',
          'referrer-policy': 'no-referrer',
          'content-security-policy':
            "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        },
      });
    } catch {
      return json({ status: 'unavailable', database: 'query_failed', message: 'Verifique a migração e o vínculo D1.' }, 503);
    }
  },
};

export { htmlEscape, publishedProducts };
