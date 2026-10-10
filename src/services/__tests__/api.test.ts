import { describe, it, expect } from 'vitest';
import { parseAIResponse, parseStockPayload } from '../api';

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


describe('parseAIResponse', () => {
  it('aceita resposta válida com referência interna', () => {
    expect(parseAIResponse({
      resposta: 'Confira este produto.',
      referencias: [{ tipo: 'produto', id: 'brinco-1', titulo: 'Argola Lisa', link: '/produto/brinco-1' }],
    })).toEqual({
      resposta: 'Confira este produto.',
      referencias: [{ tipo: 'produto', id: 'brinco-1', titulo: 'Argola Lisa', link: '/produto/brinco-1' }],
    });
  });

  it('rejeita estruturas vazias, inválidas ou respostas enormes', () => {
    expect(parseAIResponse(null)).toBeNull();
    expect(parseAIResponse({ resposta: '', referencias: [] })).toBeNull();
    expect(parseAIResponse({ resposta: 'ok', referencias: 'inválido' })).toBeNull();
    expect(parseAIResponse({ resposta: 'x'.repeat(10001), referencias: [] })).toBeNull();
  });

  it('descarta links externos e referências malformadas', () => {
    expect(parseAIResponse({
      resposta: 'Resposta',
      referencias: [
        { tipo: 'produto', id: 'x', titulo: 'Externo', link: 'javascript:alert(1)' },
        { tipo: 'produto', id: 'x', titulo: 'Externo', link: '//evil.example' },
        { tipo: 'produto', id: 'ok', titulo: 'Interno', link: '/produto/ok' },
        { tipo: 'desconhecido', id: 'x', titulo: 'X', link: '/x' },
      ],
    })?.referencias).toEqual([
      { tipo: 'produto', id: 'ok', titulo: 'Interno', link: '/produto/ok' },
    ]);
  });
});
