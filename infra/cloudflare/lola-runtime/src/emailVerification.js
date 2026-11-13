// E-mail transacional da LOLA: servidor/Worker apenas, sem VITE_ ou segredo no browser.
// Envio real exige domínio verificado no Resend e segredo RESEND_API_KEY.
// Não expõe HTTP; handlers públicos devem exigir sessão, Turnstile e limites por IP.
const MAX_EMAILS_PER_HOUR = 3;
const OTP_TTL_MS = 10 * 60_000;
const OTP_RANGE = 100_000_000;
const MAX_UINT = 2 ** 32;
const UNBIASED_LIMIT = MAX_UINT - (MAX_UINT % OTP_RANGE);

function envReady(env) {
  if (!env?.USERS_DB?.prepare) throw new Error('USERS_DB ausente.');
  if (!env.EMAIL_OTP_HMAC_KEY || env.EMAIL_OTP_HMAC_KEY.length < 32) {
    throw new Error('Segredo HMAC para desafios de verificação indisponível.');
  }
  if (!env.RESEND_API_KEY || !env.LOLA_MAIL_FROM) throw new Error('E-mail transacional não configurado.');
  const sender = String(env.LOLA_MAIL_FROM);
  if (!/^\S+@\S+\.\S+$/.test(sender) || /[<>\r\n]/.test(sender)) {
    throw new Error('Remetente inválido; configure endereço do domínio verificado.');
  }
}

function newOtp() {
  let value;
  do {
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    value = bytes[0];
  } while (value >= UNBIASED_LIMIT);
  return String(value % OTP_RANGE).padStart(8, '0');
}

function bytesToHex(buf) {
  return Array.from(new Uint8Array(buf), (n) => n.toString(16).padStart(2, '0')).join('');
}

async function hmac(env, userId, challengeId, code) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(env.EMAIL_OTP_HMAC_KEY),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const digest = await crypto.subtle.sign(
    'HMAC', key, encoder.encode('LOLA-EMAIL-OTP-V1:' + userId + ':' + challengeId + ':' + code),
  );
  return bytesToHex(digest);
}

function sameDigest(a, b) {
  const left = String(a || ''), right = String(b || '');
  if (left.length !== 64 || right.length !== 64) return false;
  let diff = 0;
  for (let index = 0; index < 64; index++) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

async function readUser(db, userId) {
  const user = await db.prepare('SELECT id,email,email_verified_at,disabled_at FROM users WHERE id=?')
    .bind(userId).first();
  if (!user || user.disabled_at) throw new Error('Conta não elegível para verificação.');
  return user;
}

export async function sendEmailVerification(env, userId, options = {}) {
  envReady(env);
  if (typeof userId !== 'string' || userId.length < 16 || userId.length > 80) {
    throw new TypeError('ID da conta inválido.');
  }
  const now = options.now instanceof Date ? options.now : new Date();
  const fetchImpl = options.fetchImpl ?? fetch;
  const user = await readUser(env.USERS_DB, userId);
  if (user.email_verified_at) return { alreadyVerified: true };
  const since = new Date(now.getTime() - 60 * 60_000).toISOString();
  const recent = await env.USERS_DB.prepare(
    "SELECT COUNT(*) AS total FROM verification_challenges WHERE user_id=? AND purpose='verify_email' AND created_at>=?",
  ).bind(userId, since).first();
  if (Number(recent?.total ?? 0) >= MAX_EMAILS_PER_HOUR) throw new Error('Limite temporário de códigos atingido.');

  const code = newOtp();
  const challengeId = crypto.randomUUID();
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS).toISOString();
  const digest = await hmac(env, userId, challengeId, code);
  const inserted = await env.USERS_DB.prepare(
    "INSERT INTO verification_challenges(id,user_id,purpose,digest_hex,created_at,expires_at) VALUES (?,?,?,?,?,?)",
  ).bind(challengeId, userId, 'verify_email', digest, now.toISOString(), expiresAt).run();
  if (!inserted?.success) throw new Error('Não foi possível registrar verificação.');

  // Não retornar o código em nenhuma API; só o provedor de e-mail o recebe.
  let delivered = false;
  try {
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + env.RESEND_API_KEY,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        from: env.LOLA_MAIL_FROM,
        to: [user.email],
        subject: 'LOLA — confirme seu e-mail',
        text: 'Seu código de verificação LOLA é: ' + code +
          '\nEle expira em 10 minutos. Se você não solicitou, ignore esta mensagem.',
      }),
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
    });
    // Uma resposta HTTP confirmada não prova entrega em caixa postal.
    delivered = response.status === 200 || response.status === 201;
    if (!delivered) throw new Error('Provedor recusou envio de e-mail.');
  } catch {
    // Falhas ambíguas de rede podem ter entregue o e-mail; preservar o código
    // por até 10 min evita uma diferença que invalide uma mensagem entregue.
    throw new Error('Não foi possível confirmar o envio. Tente mais tarde.');
  }
  return { challengeId, expiresAt, sent: true };
}

export async function confirmEmailVerification(env, userId, challengeId, code, options = {}) {
  if (!env?.USERS_DB?.prepare || !env.EMAIL_OTP_HMAC_KEY) throw new Error('Verificação indisponível.');
  if (typeof code !== 'string' || !/^\d{8}$/.test(code) ||
      typeof challengeId !== 'string' || challengeId.length < 16 || challengeId.length > 80 ||
      typeof userId !== 'string' || userId.length < 16 || userId.length > 80) {
    return false;
  }
  const now = options.now instanceof Date ? options.now : new Date();
  const challenge = await env.USERS_DB.prepare(
    "SELECT digest_hex,attempts,expires_at,consumed_at FROM verification_challenges WHERE id=? AND user_id=? AND purpose='verify_email'",
  ).bind(challengeId,userId).first();
  if (!challenge || challenge.consumed_at || challenge.attempts >= 5 || challenge.expires_at <= now.toISOString()) return false;
  const digest = await hmac(env,userId,challengeId,code);
  if (!sameDigest(digest,challenge.digest_hex)) {
    await env.USERS_DB.prepare(
      "UPDATE verification_challenges SET attempts=attempts+1 WHERE id=? AND user_id=? AND consumed_at IS NULL AND attempts<5",
    ).bind(challengeId,userId).run();
    return false;
  }
  // batch em um único USERS_DB é atômico. Consumo condicional impede reuso.
  const results = await env.USERS_DB.batch([
    env.USERS_DB.prepare(
      "UPDATE verification_challenges SET consumed_at=? WHERE id=? AND user_id=? AND digest_hex=? AND consumed_at IS NULL AND attempts<5 AND expires_at>?",
    ).bind(now.toISOString(),challengeId,userId,digest,now.toISOString()),
    env.USERS_DB.prepare(
      "UPDATE users SET email_verified_at=COALESCE(email_verified_at,?),updated_at=? WHERE id=? AND disabled_at IS NULL",
    ).bind(now.toISOString(),now.toISOString(),userId),
  ]);
  return results?.[0]?.success === true && Number(results[0].meta?.changes ?? 0) === 1 &&
    results?.[1]?.success === true && Number(results[1].meta?.changes ?? 0) === 1;
}
