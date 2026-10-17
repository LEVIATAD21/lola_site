import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookupBrazilianCep } from '../cep';

afterEach(() => vi.unstubAllGlobals());

function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('lookupBrazilianCep', () => {
  it('consulta a rota interna da vitrine e preenche o endereço', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({
      cep: '26300000',
      street: 'Rua das Flores',
      neighborhood: 'Centro',
      city: 'Queimados',
      state: 'RJ',
    })));

    await expect(lookupBrazilianCep('26300-000')).resolves.toEqual({
      cep: '26300000',
      street: 'Rua das Flores',
      neighborhood: 'Centro',
      city: 'Queimados',
      state: 'RJ',
    });
    // Mesma origem de propósito: o CSP de produção só permite `connect-src 'self'` (RT-R-04).
    expect(fetch).toHaveBeenCalledWith(
      '/api/cep/26300000',
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

  it('retorna null quando o CEP não existe (404 da rota interna)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({ error: 'CEP não encontrado.' }, 404)));
    await expect(lookupBrazilianCep('99999999')).resolves.toBeNull();
  });

  it('informa falha HTTP e resposta incompleta do serviço', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({}, 502)));
    await expect(lookupBrazilianCep('26300000')).rejects.toThrow(/consultar o CEP/);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({ street: 'Rua' })));
    await expect(lookupBrazilianCep('26300000')).rejects.toThrow(/endereço incompleto/);
  });
});
