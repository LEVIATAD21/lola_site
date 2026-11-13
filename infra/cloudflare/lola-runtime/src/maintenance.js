// Manutenção D1 para a LOLA. Não há exclusão financeira nem de clientes.
// Só apaga registros EFÊMEROS vencidos. Nunca armazena PDF/PIX/base64.
const MAX_PER_TABLE = 200;
const TARGETS = Object.freeze([
  { binding: 'USERS_DB', table: 'verification_challenges', clause: 'expires_at <= ?' },
  { binding: 'USERS_DB', table: 'user_sessions', clause: 'expires_at <= ? OR revoked_at IS NOT NULL' },
  { binding: 'USERS_DB', table: 'phone_verification_attempts', clause: 'expires_at <= ?' },
  { binding: 'USERS_DB', table: 'auth_rate_buckets', clause: 'reset_at <= ?' },
  { binding: 'DB', table: 'commerce_temporary_artifacts', clause: 'expires_at <= ? AND legal_hold = 0' },
]);
/** Explicit allowlist of tables prevents SQL injection even by misconfiguration. */
const STATEMENTS = Object.freeze({
  verification_challenges: 'DELETE FROM verification_challenges WHERE id IN (SELECT id FROM verification_challenges WHERE expires_at <= ? ORDER BY expires_at LIMIT ?)',
  user_sessions: 'DELETE FROM user_sessions WHERE id IN (SELECT id FROM user_sessions WHERE expires_at <= ? OR revoked_at IS NOT NULL ORDER BY expires_at LIMIT ?)',
  phone_verification_attempts: 'DELETE FROM phone_verification_attempts WHERE id IN (SELECT id FROM phone_verification_attempts WHERE expires_at <= ? ORDER BY expires_at LIMIT ?)',
  auth_rate_buckets: 'DELETE FROM auth_rate_buckets WHERE rowid IN (SELECT rowid FROM auth_rate_buckets WHERE reset_at <= ? ORDER BY reset_at LIMIT ?)',
  commerce_temporary_artifacts: 'DELETE FROM commerce_temporary_artifacts WHERE id IN (SELECT id FROM commerce_temporary_artifacts WHERE expires_at <= ? AND legal_hold = 0 ORDER BY expires_at LIMIT ?)',
});

export async function purgeExpired(env, now = new Date()) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new TypeError('Instante inválido.');
  if (!env?.DB?.prepare || !env?.USERS_DB?.prepare) {
    throw new Error('Manutenção recusada: DB e USERS_DB são obrigatórios.');
  }
  const iso = now.toISOString();
  const changes = {};
  for (const target of TARGETS) {
    const db = env[target.binding];
    const result = await db.prepare(STATEMENTS[target.table]).bind(iso, MAX_PER_TABLE).run();
    if (result?.success !== true) throw new Error('Manutenção D1 não confirmou a exclusão: ' + target.table);
    changes[target.table] = Number(result.meta?.changes ?? 0);
  }
  return Object.freeze({ executedAt: iso, changes });
}

/** Registro sem PII; o agendador é interno e não pode ser chamado por HTTP. */
export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil((async () => {
      const summary = await purgeExpired(env);
      console.log('[lola-maintenance] TTL metadata purged', JSON.stringify(summary));
    })());
  },
  async fetch() {
    return new Response(JSON.stringify({ error: 'Endpoint não disponível.' }), {
      status: 404, headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  },
};
