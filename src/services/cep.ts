export interface BrazilianCepAddress {
  cep: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
}

/**
 * Consulta um CEP brasileiro pela rota interna da vitrine (`GET /api/cep/:cep`).
 *
 * O navegador não fala mais com o ViaCEP direto: em produção o CSP da vitrine
 * só permite `connect-src 'self'`, então o fetch cross-origin era bloqueado
 * pelo próprio navegador (RT-R-04). A consulta externa acontece no servidor e
 * chega aqui na mesma origem, no formato de `BrazilianCepAddress`.
 *
 * Retorna null para CEP inválido (sem consultar a rede) ou não cadastrado;
 * falha de rede/HTTP do nosso próprio servidor lança erro.
 */
export async function lookupBrazilianCep(input: string): Promise<BrazilianCepAddress | null> {
  const cep = input.replace(/\D/g, '');
  if (!/^\d{8}$/.test(cep)) return null;

  const response = await fetch(`/api/cep/${cep}`, {
    headers: { Accept: 'application/json' },
  });
  // 404 é o contrato de "CEP não encontrado" da rota interna; qualquer outro
  // status fora do 200 é falha e deve cair no catch de quem chama.
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Não foi possível consultar o CEP.');

  const payload: unknown = await response.json();
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Resposta inválida ao consultar o CEP.');
  }

  const address = payload as Record<string, unknown>;
  const city = typeof address.city === 'string' ? address.city.trim() : '';
  const state = typeof address.state === 'string' ? address.state.trim().toUpperCase() : '';
  if (!city || !/^[A-Z]{2}$/.test(state)) {
    throw new Error('O serviço de CEP retornou um endereço incompleto.');
  }

  return {
    cep,
    street: typeof address.street === 'string' ? address.street.trim() : '',
    neighborhood: typeof address.neighborhood === 'string' ? address.neighborhood.trim() : '',
    city,
    state,
  };
}
