import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookupBrazilianCep } from '../cep';

afterEach(() => vi.unstubAllGlobals());

function mockResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as unknown as Response;
}

describe('lookupBrazilianCep', () => {
  it('preenche logradouro, bairro, cidade e UF usando o CEP', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({
      cep: '26300-000',
      logradouro: 'Rua das Flores',
      bairro: 'Centro',
      localidade: 'Queimados',
      uf: 'RJ',
    })));

    await expect(lookupBrazilianCep('26300-000')).resolves.toEqual({
      cep: '26300000',
      street: 'Rua das Flores',
      neighborhood: 'Centro',
      city: 'Queimados',
      state: 'RJ',
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://viacep.com.br/ws/26300000/json/',
      { headers: { Accept: 'application/json' } },
    );
  });

  it('não consulta formatos inválidos', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(lookupBrazilianCep('1234')).resolves.toBeNull();
    await expect(lookupBrazilianCep('12A45-678')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retorna null quando o CEP não existe', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({ erro: true })));
    await expect(lookupBrazilianCep('99999999')).resolves.toBeNull();
  });

  it('informa falha HTTP e resposta incompleta do serviço', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({}, false)));
    await expect(lookupBrazilianCep('26300000')).rejects.toThrow(/consultar o CEP/);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({ logradouro: 'Rua' })));
    await expect(lookupBrazilianCep('26300000')).rejects.toThrow(/endereço incompleto/);
  });
});
