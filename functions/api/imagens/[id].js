import { reply, requireReadOnly, unavailable } from '../../_shared/publicApi.js';

const idPattern = /^[A-Za-z0-9_-]{2,64}$/;
const headers = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Cache-Control': 'public, max-age=60',
};

export async function onRequest(context) {
  const rejected = requireReadOnly(context);
  if (rejected) return rejected;
  const id = context.params?.id;
  if (typeof id !== 'string' || !idPattern.test(id)) {
    return reply({ error: 'Imagem não encontrada.' }, 404);
  }
  try {
    if (!context.env?.DB) return unavailable();
    const image = await context.env.DB.prepare(
      `SELECT f.mime_type, f.bytes FROM product_photos f
       INNER JOIN products p ON p.id=f.product_id
       WHERE f.product_id=? AND p.published=1 AND p.archived_at IS NULL
       LIMIT 1`
    ).bind(id).first();
    if (!image) return reply({ error: 'Imagem não encontrada.' }, 404);
    const bytes = image.bytes;
    if ((!Array.isArray(bytes) && !(bytes instanceof ArrayBuffer) && !ArrayBuffer.isView(bytes)) ||
        !['image/jpeg', 'image/png', 'image/webp'].includes(image.mime_type)) return unavailable();
    const payload = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : new Uint8Array(bytes);
    if (payload.byteLength < 20 || payload.byteLength > 307200) return unavailable();
    return new Response(payload, { status: 200, headers: { ...headers, 'Content-Type': image.mime_type } });
  } catch {
    return unavailable();
  }
}
