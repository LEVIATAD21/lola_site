import test from 'node:test';
import assert from 'node:assert/strict';
import cleanup, { purgeExpired } from '../src/maintenance.js';
import { sendEmailVerification, confirmEmailVerification } from '../src/emailVerification.js';
import { startPhoneVerification } from '../src/phoneVerification.js';

const fixedNow = new Date('2026-11-13T12:00:00.000Z');

function dbFixture() {
  const statements = [];
  const db = {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async run() {
              statements.push({ sql, values });
              return { success: true, meta: { changes: 2 } };
            },
            async first() {
              if (sql.startsWith('SELECT id,email,')) {
                return { id: 'user-' + '1'.repeat(32), email: 'buyer@example.invalid',
                  email_verified_at: null, disabled_at: null };
              }
              if (sql.includes('COUNT(*)')) return { total: 0 };
              return null;
            },
          };
        },
      };
    },
  };
  return { db, statements };
}

test('manutenção recusa executar com um dos bancos ausente', async () => {
  await assert.rejects(purgeExpired({ DB: dbFixture().db }, fixedNow), /obrigatórios/);
  await assert.rejects(purgeExpired({ USERS_DB: dbFixture().db }, fixedNow), /obrigatórios/);
});

test('limpeza só atinge tabelas efêmeras em lotes limitados; registros financeiros intactos', async () => {
  const users = dbFixture(), commerce = dbFixture();
  const summary = await purgeExpired({ USERS_DB: users.db, DB: commerce.db }, fixedNow);
  assert.equal(Object.keys(summary.changes).length, 5);
  assert.equal(users.statements.length, 4);
  assert.equal(commerce.statements.length, 1);
  const full = [...users.statements, ...commerce.statements];
  for (const statement of full) {
    assert.match(statement.sql, /^DELETE FROM (verification_challenges|user_sessions|phone_verification_attempts|auth_rate_buckets|commerce_temporary_artifacts)\b/);
    assert.equal(statement.values[0], fixedNow.toISOString());
    assert.equal(statement.values[1], 200);
    assert.doesNotMatch(statement.sql, /commerce_orders|commerce_payments|purchase_summaries|financial_audit/);
  }
  assert.match(commerce.statements[0].sql, /legal_hold = 0/);
});

test('não há rota HTTP para disparar manutenção nem listar contas', async () => {
  const response = await cleanup.fetch(new Request('https://lola.example/accounts'));
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('desabilita e-mail sem segredo, domínio verificado e conta elegível', async () => {
  await assert.rejects(
    sendEmailVerification({ USERS_DB: dbFixture().db }, 'user-' + '1'.repeat(32)),
    /Segredo HMAC/,
  );
});

test('e-mail enviado pelo provedor usa código forte temporário e persiste somente digest HMAC', async () => {
  const users = dbFixture();
  const env = {
    USERS_DB: users.db,
    EMAIL_OTP_HMAC_KEY: 'secret-OTP-'.repeat(5),
    RESEND_API_KEY: 're_for_contract_test_only_not_real',
    LOLA_MAIL_FROM: 'verificacao@lola.example',
  };
  let outbound;
  const result = await sendEmailVerification(env,'user-' + '1'.repeat(32), {
    now: fixedNow,
    fetchImpl: async (url, init) => {
      outbound = { url, init };
      return new Response(JSON.stringify({ id: 'email-provider-id' }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    },
  });
  assert.equal(result.sent, true);
  assert.ok(!('code' in result), 'código nunca deve retornar ao usuário');
  assert.equal(outbound.url, 'https://api.resend.com/emails');
  const mail = JSON.parse(outbound.init.body);
  assert.deepEqual(mail.to, ['buyer@example.invalid']);
  const code = /\b(\d{8})\b/.exec(mail.text)?.[1];
  assert.match(code, /^\d{8}$/);
  assert.equal(users.statements.length, 1);
  assert.equal(users.statements[0].values[3].length, 64);
  assert.notEqual(users.statements[0].values[3], code);
  assert.ok(!JSON.stringify(result).includes(code));
  // Sem acesso ao challenge persistido real, uma verificação aleatória falha.
  assert.equal(await confirmEmailVerification(env,'user-' + '1'.repeat(32),result.challengeId,'00000000',{now:fixedNow}),false);
});

test('SMS não é enviado sem habilitação explícita e aceite de cobrança', async () => {
  const db = dbFixture();
  await assert.rejects(startPhoneVerification({
    USERS_DB: db.db,
    LOLA_SMS_ENABLED: 'false', LOLA_SMS_COSTS_APPROVED: 'false',
  }, 'user-' + '1'.repeat(32), '+5521987654321'), /elegível|indisponível|habilitada/);
  assert.equal(db.statements.length, 0);
});
