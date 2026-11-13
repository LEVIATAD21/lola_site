import { reply, requireReadOnly, unavailable } from '../_shared/publicApi.js';

// Public health: checks a REAL SQL table, not just the presence of the binding.
// Do not print database identifiers, table contents or credentials to customers.
export async function onRequest(context) {
  const rejected = requireReadOnly(context);
  if (rejected) return rejected;
  try {
    const info = await context.env.DB.prepare('SELECT COUNT(*) AS count FROM products').first();
    if (typeof info?.count !== 'number' || !Number.isSafeInteger(info.count)) return unavailable();
    return reply({ status: 'ok', database: 'ready', mode: 'catalog-read-only' });
  } catch {
    return unavailable();
  }
}
