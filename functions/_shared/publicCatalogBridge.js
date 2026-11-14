// Only published catalog resources cross this boundary. Never forward credentials.
export async function publicCatalogBridge(context, path) {
  const headers = {
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY', 'Cross-Origin-Resource-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow, noarchive'
  };
  const error = (status, message, extra={}) => new Response(JSON.stringify({error:message}), {
    status, headers:{...headers,'Content-Type':'application/json; charset=utf-8',...extra}
  });
  if (context.request.method !== 'GET') return error(405,'Método não permitido.',{Allow:'GET'});
  if (!/^\/(?:catalog|(?:imagens|estoque)\/[a-zA-Z0-9][a-zA-Z0-9_-]{0,79})$/.test(path))
    return error(404,'Recurso não encontrado.');
  try {
    const result = await fetch('https://lola-admin-api.pages.dev/api/public'+path, {
      method:'GET', redirect:'manual',
      headers:{Accept:path.startsWith('/imagens/')?'image/webp,image/jpeg,image/png':'application/json'},
      signal:AbortSignal.timeout(10000)
    });
    if (result.status >= 300 && result.status < 400) return error(503,'Serviço temporariamente indisponível.');
    const contentType = result.headers.get('content-type') || '';
    if (!/^application\/json\b|^image\/(?:webp|jpeg|png)\b/i.test(contentType))
      return error(503,'Serviço temporariamente indisponível.');
    return new Response(result.body,{status:result.status,headers:{...headers,'Content-Type':contentType}});
  } catch { return error(503,'Serviço temporariamente indisponível.'); }
}
