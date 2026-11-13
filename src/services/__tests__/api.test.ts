import { describe, it, expect, vi } from 'vitest';
import { consultAI, parseAIResponse, parseDraftOrderConfirmation, parseStockPayload } from '../api';

const validPayload = { productId: 'brinco-1', disponivel: 8 };

describe('parseStockPayload', () => {
  it('aceita apenas a disponibilidade pública do produto', () => {
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

  it('rejeita disponibilidade negativa, fracionada ou não numérica', () => {
    expect(parseStockPayload({ ...validPayload, disponivel: -1 })).toBeNull();
    expect(parseStockPayload({ ...validPayload, disponivel: '8' })).toBeNull();
    expect(parseStockPayload({ ...validPayload, disponivel: 1.5 })).toBeNull();
    expect(parseStockPayload({ ...validPayload, disponivel: NaN })).toBeNull();
  });

  it('não precisa nem expõe contadores internos de estoque', () => {
    expect(parseStockPayload({
      productId: 'brinco-1', disponivel: 8,
      total: 10, reservado: 1, vendido: 1,
    })).toEqual(validPayload);
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
        { tipo: 'produto', id: 'x', titulo: 'Host', link: '//evil.com' },
        // VUL-07: barra invertida é normalizada em barra pelo navegador e o
        // destino vira https://evil.com — open redirect disfarçado de interno.
        { tipo: 'produto', id: 'x', titulo: 'Barra invertida', link: '/' + String.fromCharCode(92) + 'evil.com' },
        { tipo: 'produto', id: 'x', titulo: 'Duas invertidas', link: '/' + String.fromCharCode(92) + String.fromCharCode(92) + 'evil.com' },
        { tipo: 'produto', id: 'x', titulo: 'Tabulação', link: '/' + String.fromCharCode(9) + 'evil.com' },
        { tipo: 'produto', id: 'x', titulo: 'Espaço', link: '/ evil.com' },
        { tipo: 'produto', id: 'x', titulo: 'Outra origem', link: 'https://evil.com/produto/x' },
        { tipo: 'produto', id: 'x', titulo: 'Sem barra', link: 'produto/x' },
        { tipo: 'desconhecido', id: 'x', titulo: 'Tipo inválido', link: '/produto/x' },
      ],
    })?.referencias).toEqual([]);
  });

  it('mantém fragmentos e caminhos internos legítimos', () => {
    expect(parseAIResponse({
      resposta: 'Resposta',
      referencias: [
        { tipo: 'produto', id: 'brinco-1', titulo: 'Argola', link: '/produto/brinco-1' },
        { tipo: 'FAQ', id: 'garantia', titulo: 'Garantia', link: '#garantia' },
        { tipo: 'politica', id: 'frete', titulo: 'Frete', link: '#frete' },
      ],
    })?.referencias).toHaveLength(3);
  });
});


describe('parseDraftOrderConfirmation', () => {
  const valid = {
    success: true,
    order: {
      orderNumber: 'LOLA-20261010-ABCDEF123456',
      createdAt: '2026-10-10T12:00:00.000Z',
      status: 'awaiting_payment_setup',
      paymentStatus: 'not_configured',
      paymentMethod: 'pix',
      shippingOptionId: 'pac',
      itemCount: 2,
      subtotal: 99.8,
      discount: 9.98,
      shipping: 19.9,
      giftWrap: 9.9,
      total: 119.62,
    },
  };

  it('aceita pré-pedido sem declarar pagamento aprovado', () => {
    expect(parseDraftOrderConfirmation(valid)).toMatchObject({
      orderNumber: 'LOLA-20261010-ABCDEF123456',
      status: 'awaiting_payment_setup',
      paymentStatus: 'not_configured',
      total: 119.62,
    });
  });

  it('rejeita respostas malformadas, totais negativos e status pago não autorizado', () => {
    expect(parseDraftOrderConfirmation(null)).toBeNull();
    expect(parseDraftOrderConfirmation({ ...valid, success: false })).toBeNull();
    expect(parseDraftOrderConfirmation({ ...valid, order: { ...valid.order, total: -1 } })).toBeNull();
    expect(parseDraftOrderConfirmation({ ...valid, order: { ...valid.order, paymentStatus: 'paid' } })).toBeNull();
    expect(parseDraftOrderConfirmation({ ...valid, order: { ...valid.order, paymentMethod: 'credit_card' } })).toBeNull();
  });
});

describe('minimização de dados no assistente público', () => {
  it('envia somente a pergunta, nunca sessão, carrinho ou contexto privado', async () => {
    let body: unknown = null;
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ resposta: 'Atendimento local', referencias: [] }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }));
    try {
      const output = await consultAI('Onde encontro brincos?', {
        produtoId: 'brinco-1',
        carrinho: [{ nome: 'pedido privado', quantity: 5 }],
        sessaoCliente: 'token-sensivel-nunca-enviar',
      });
      expect(output.resposta).toBe('Atendimento local');
      expect(body).toEqual({ pergunta: 'Onde encontro brincos?' });
      expect(JSON.stringify(body)).not.toContain('token-sensivel');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
