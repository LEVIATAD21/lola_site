import { describe, it, expect } from 'vitest';
import { parseStockPayload } from '../api';

const validPayload = {
  productId: 'brinco-1',
  total: 10,
  reservado: 1,
  vendido: 1,
  disponivel: 8,
};

describe('parseStockPayload', () => {
  it('aceita um payload válido', () => {
    expect(parseStockPayload(validPayload, 'brinco-1')).toEqual(validPayload);
  });

  it('rejeita payloads ausentes ou não-objeto', () => {
    expect(parseStockPayload(null)).toBeNull();
    expect(parseStockPayload(undefined)).toBeNull();
    expect(parseStockPayload('ok')).toBeNull();
    expect(parseStockPayload(200)).toBeNull();
  });

  it('rejeita objeto vazio ou campos ausentes', () => {
    expect(parseStockPayload({})).toBeNull();
    expect(parseStockPayload({ productId: 'brinco-1' })).toBeNull();
  });

  it('rejeita productId de tipo inválido ou vazio', () => {
    expect(parseStockPayload({ ...validPayload, productId: 42 })).toBeNull();
    expect(parseStockPayload({ ...validPayload, productId: '' })).toBeNull();
  });

  it('rejeita quando o productId não corresponde ao produto consultado', () => {
    expect(parseStockPayload(validPayload, 'brinco-2')).toBeNull();
  });

  it('rejeita quantidades negativas ou não numéricas', () => {
    expect(parseStockPayload({ ...validPayload, disponivel: -1 })).toBeNull();
    expect(parseStockPayload({ ...validPayload, total: '10' })).toBeNull();
    expect(parseStockPayload({ ...validPayload, disponivel: NaN })).toBeNull();
    expect(parseStockPayload({ ...validPayload, reservado: Infinity })).toBeNull();
  });

  it('rejeita campos obrigatórios ausentes no corpo', () => {
    const { reservado: _omitted, ...missing } = validPayload;
    expect(parseStockPayload(missing)).toBeNull();
  });
});
