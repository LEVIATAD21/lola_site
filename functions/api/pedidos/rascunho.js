import { reply } from '../../_shared/publicApi.js';

// Intentionally disabled on static Pages until the transactional D1 checkout,
// durable inventory reservations, Asaas webhooks, and authenticated customers
// have all passed production acceptance tests. Never pretend a sale succeeded.
export async function onRequest(context) {
  if (!['POST','GET'].includes(context.request?.method ?? '')) {
    return reply({ error: 'Método não permitido.' }, 405, { Allow: 'POST, GET' });
  }
  return reply({
    error: 'Pedidos temporariamente indisponíveis: pagamentos ainda não estão habilitados nesta infraestrutura.',
    code: 'CHECKOUT_NOT_CONFIGURED',
  }, 503, { 'Retry-After': '3600' });
}
