// Integração opcional e REAL de telefone via Twilio Verify.
// SMS não é gratuito ilimitado: por padrão está DESABILITADO e exige aceite
// de custos pelo titular. Nenhuma senha/código é persistido no banco D1.
const ACCOUNT_SID_PATTERN = /^AC[a-fA-F0-9]{32}$/;
const SERVICE_SID_PATTERN = /^VA[a-fA-F0-9]{32}$/;
const PHONE_PATTERN = /^\+55[1-9][0-9]{9,10}$/;

function settings(env) {
  if (env?.LOLA_SMS_ENABLED !== 'true' || env?.LOLA_SMS_COSTS_APPROVED !== 'true') {
    throw new Error('SMS indisponível: verificação telefônica não foi habilitada pelo titular.');
  }
  if (!ACCOUNT_SID_PATTERN.test(env.TWILIO_ACCOUNT_SID ?? '') ||
      !SERVICE_SID_PATTERN.test(env.TWILIO_VERIFY_SERVICE_SID ?? '') ||
      !/^.{16,128}$/.test(env.TWILIO_AUTH_TOKEN ?? '')) {
    throw new Error('Provedor de verificação telefônica não configurado.');
  }
}
function phone(value) {
  if (typeof value !== 'string' || !PHONE_PATTERN.test(value)) {
    throw new TypeError('Informe telefone brasileiro no padrão internacional +55DDD...');
  }
  return value;
}
async function callTwilio(env, route, params, fetchImpl) {
  settings(env);
  const origin = 'https://verify.twilio.com/v2/Services/' + env.TWILIO_VERIFY_SERVICE_SID + '/';
  const response = await fetchImpl(origin + route, {
    method: 'POST',
    headers: {
      authorization: 'Basic ' + btoa(env.TWILIO_ACCOUNT_SID + ':' + env.TWILIO_AUTH_TOKEN),
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body: new URLSearchParams(params).toString(),
    redirect: 'manual',
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok || response.status >= 300) throw new Error('Verificação telefônica indisponível.');
  const payload = await response.json();
  if (!payload || typeof payload !== 'object' ||
      typeof payload.status !== 'string') throw new Error('Resposta inválida do provedor telefônico.');
  return payload;
}
/** Apenas handlers autenticados e com limite/rate-check devem chamar. */
export async function startPhoneVerification(env, userId, phoneE164, options = {}) {
  if (!env?.USERS_DB?.prepare) throw new Error('USERS_DB indisponível.');
  const mobile = phone(phoneE164);
  const user = await env.USERS_DB.prepare(
    'SELECT id,phone_e164,disabled_at,phone_verified_at FROM users WHERE id=?',
  ).bind(userId).first();
  if (!user || user.disabled_at || user.phone_e164 !== mobile) throw new Error('Conta/telefone não elegível.');
  if (user.phone_verified_at) return { alreadyVerified: true };
  const result = await callTwilio(env,'Verifications', { To: mobile, Channel: 'sms' }, options.fetchImpl ?? fetch);
  if (typeof result.sid !== 'string' || result.status !== 'pending') {
    throw new Error('Verificação telefônica não foi iniciada.');
  }
  const now = options.now instanceof Date ? options.now : new Date();
  const store = await env.USERS_DB.prepare(
    'INSERT INTO phone_verification_attempts(id,user_id,phone_e164,provider,state,provider_reference,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)',
  ).bind(crypto.randomUUID(),userId,mobile,'twilio-verify','pending',result.sid,now.toISOString(),
    new Date(now.getTime()+10*60_000).toISOString()).run();
  if (!store?.success) throw new Error('Não foi possível persistir o desafio telefônico.');
  return { sent: true };
}

/** Provider é a autoridade, nunca código digitado comparado localmente. */
export async function confirmPhoneVerification(env, userId, code, options = {}) {
  if (!env?.USERS_DB?.prepare) throw new Error('USERS_DB indisponível.');
  if (typeof code !== 'string' || !/^\d{4,10}$/.test(code)) return false;
  const user = await env.USERS_DB.prepare(
    'SELECT id,phone_e164,disabled_at,phone_verified_at,email_verified_at FROM users WHERE id=?',
  ).bind(userId).first();
  if (!user || user.disabled_at || !user.email_verified_at || !user.phone_e164) return false;
  if (user.phone_verified_at) return true;
  const now = options.now instanceof Date ? options.now : new Date();
  const challenge = await env.USERS_DB.prepare(
    "SELECT id,phone_e164,expires_at,state FROM phone_verification_attempts WHERE user_id=? AND state='pending' ORDER BY created_at DESC LIMIT 1",
  ).bind(userId).first();
  if (!challenge || challenge.phone_e164 !== user.phone_e164 || challenge.expires_at <= now.toISOString()) return false;
  const response = await callTwilio(env, 'VerificationCheck', {
    To: user.phone_e164, Code: code,
  }, options.fetchImpl ?? fetch);
  if (response.status !== 'approved' || response.valid !== true) return false;
  const results = await env.USERS_DB.batch([
    env.USERS_DB.prepare(
      "UPDATE phone_verification_attempts SET state='approved',updated_at=? WHERE id=? AND state='pending' AND expires_at>?",
    ).bind(now.toISOString(),challenge.id,now.toISOString()),
    env.USERS_DB.prepare(
      "UPDATE users SET phone_verified_at=COALESCE(phone_verified_at,?),updated_at=? WHERE id=? AND email_verified_at IS NOT NULL AND disabled_at IS NULL " +
      "AND EXISTS (SELECT 1 FROM phone_verification_attempts WHERE id=? AND user_id=? " +
      "AND phone_e164=users.phone_e164 AND provider='twilio-verify' AND state='approved' " +
      "AND updated_at=? AND expires_at>?)",
    ).bind(now.toISOString(),now.toISOString(),userId,challenge.id,userId,now.toISOString(),now.toISOString()),
  ]);
  return results?.[0]?.success === true && Number(results[0]?.meta?.changes ?? 0) === 1 &&
    results?.[1]?.success === true && Number(results[1]?.meta?.changes ?? 0) === 1;
}
