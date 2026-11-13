// Pré-condição obrigatória para checkout futuro: nunca inferir verificação
// porque o navegador enviou um flag, telefone ou e-mail.
export class BuyerVerificationRequired extends Error {
  constructor(reason) {
    super('Conta não habilitada para compras: ' + reason + '.');
    this.name = 'BuyerVerificationRequired';
    this.code = reason;
  }
}

/**
 * Chamado exclusivamente DEPOIS de validar a sessão autenticada do cliente.
 * userId não pode vir diretamente do payload de checkout.
 */
export async function requireVerifiedBuyer(env, authenticatedUserId) {
  if (!env?.USERS_DB?.prepare) throw new Error('Banco de identidade indisponível.');
  if (typeof authenticatedUserId !== 'string' || authenticatedUserId.length < 16 || authenticatedUserId.length > 80) {
    throw new BuyerVerificationRequired('sessao_invalida');
  }
  const user = await env.USERS_DB.prepare(
    'SELECT id,email_verified_at,phone_verified_at,disabled_at FROM users WHERE id=?',
  ).bind(authenticatedUserId).first();
  if (!user || user.disabled_at) throw new BuyerVerificationRequired('conta_indisponivel');
  if (!user.email_verified_at) throw new BuyerVerificationRequired('email_nao_verificado');
  if (!user.phone_verified_at) throw new BuyerVerificationRequired('telefone_nao_verificado');
  return { userId: user.id };
}
