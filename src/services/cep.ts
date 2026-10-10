export interface BrazilianCepAddress {
  cep: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
}

/**
 * Looks up one Brazilian CEP using ViaCEP.
 * Returns null for an invalid or unregistered CEP; network/HTTP failures throw.
 * The returned address is a convenience and must still be reviewed by the customer.
 */
export async function lookupBrazilianCep(input: string): Promise<BrazilianCepAddress | null> {
  const cep = input.replace(/\D/g, '');
  if (!/^\d{8}$/.test(cep)) return null;

  const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('Não foi possível consultar o CEP.');

  const payload: unknown = await response.json();
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Resposta inválida ao consultar o CEP.');
  }

  const address = payload as Record<string, unknown>;
  if (address.erro === true || address.erro === 'true') return null;

  const city = typeof address.localidade === 'string' ? address.localidade.trim() : '';
  const state = typeof address.uf === 'string' ? address.uf.trim().toUpperCase() : '';
  if (!city || !/^[A-Z]{2}$/.test(state)) {
    throw new Error('O serviço de CEP retornou um endereço incompleto.');
  }

  return {
    cep,
    street: typeof address.logradouro === 'string' ? address.logradouro.trim() : '',
    neighborhood: typeof address.bairro === 'string' ? address.bairro.trim() : '',
    city,
    state,
  };
}
