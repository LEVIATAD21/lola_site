import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpDataPlane, type HttpDataPlaneOptions } from '../httpDataPlane';
import type { InternalCallResult, InternalClient } from '../internalClient';
import { PEDIDOS_INDISPONIVEL } from '../dataPlane';

vi.mock('../logger', () => ({ log: vi.fn() }));
import { log } from '../logger';

const logMock = vi.mocked(log);
const CATALOGO: ReadonlySet<string> = new Set(['brinco-1', 'brinco-2']);
const ALVO = 'http://127.0.0.1:4200';

interface Chamada {
  method: string;
  path: string;
  body?: unknown;
}

/**
 * Cliente falso: registra as chamadas e responde conforme o programa.
 *
 * O `HttpDataPlane` não faz ele mesmo a parte da rede — ele delega ao
 * `InternalClient`, que tem seus próprios testes. Aqui o que importa é o
 * contrato: o que a vitrine faz com a resposta que o vizinho devolveu,
 * inclusive quando o vizinho manda algo que não devia.
 */
function montar(
  programa: (indice: number, chamada: Chamada) => InternalCallResult,
  options: Partial<HttpDataPlaneOptions> = {},
) {
  const chamadas: Chamada[] = [];
  const client = {
    target: ALVO,
    call: (method: string, path: string, body?: unknown) => {
      const chamada = { method, path, body };
      chamadas.push(chamada);
      return Promise.resolve(programa(chamadas.length - 1, chamada));
    },
  } as unknown as InternalClient;
  const plane = new HttpDataPlane(client, {
    ...options,
    allowedIds: options.allowedIds ?? CATALOGO,
  } as HttpDataPlaneOptions);
  return { plane, chamadas };
}

const ok = (body: Record<string, unknown>, status = 200): InternalCallResult => ({
  ok: true, status, body,
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('HttpDataPlane: o snapshot aceita só o que o catálogo conhece', () => {
  it('descarta id que não está no catálogo', async () => {
    const { plane } = montar(() => ok({
      stock: { 'brinco-1': 5, 'brinco-2': 3, 'produto-fantasma': 999 },
    }));
    expect(await plane.snapshot()).toEqual({ 'brinco-1': 5, 'brinco-2': 3 });
  });

  it('não copia chave de protótipo vinda do vizinho', async () => {
    // `JSON.parse` cria isto como propriedade própria, não altera o protótipo —
    // mas se a sanitização copiasse "tudo que veio", o servidor de dados
    // comprometido estaria escrevendo no `Object.prototype` da vitrine.
    const envenenado = JSON.parse(
      '{"__proto__":{"poluido":true},"constructor":1,"prototype":2,"brinco-1":4}',
    ) as Record<string, unknown>;
    const { plane } = montar(() => ok({ stock: envenenado }));

    const snapshot = await plane.snapshot();
    expect(snapshot).toEqual({ 'brinco-1': 4 });
    expect(({} as Record<string, unknown>).poluido).toBeUndefined();
    expect((Object.prototype as Record<string, unknown>).poluido).toBeUndefined();
    expect((Object.prototype as Record<string, unknown>)['brinco-1']).toBeUndefined();
  });

  it('devolve objeto sem protótipo', async () => {
    const { plane } = montar(() => ok({ stock: { 'brinco-1': 5 } }));
    const snapshot = await plane.snapshot();
    expect(snapshot).not.toBeNull();
    expect(Object.getPrototypeOf(snapshot as object)).toBeNull();
  });

  it('rejeita valor que não é inteiro dentro da faixa', async () => {
    const casos: Array<[string, unknown]> = [
      ['negativo', -1],
      ['fracionário', 1.5],
      ['acima do teto', 1_000_000_001],
      ['NaN', Number.NaN],
      ['infinito', Number.POSITIVE_INFINITY],
      ['string numérica', '7'],
      ['booleano', true],
      ['nulo', null],
    ];
    for (const [nome, valor] of casos) {
      const { plane } = montar(() => ok({ stock: { 'brinco-1': valor, 'brinco-2': 2 } }));
      expect(await plane.snapshot(), nome).toEqual({ 'brinco-2': 2 });
    }
  });

  it('aceita o limite superior exato', async () => {
    const { plane } = montar(() => ok({ stock: { 'brinco-1': 1_000_000_000 } }));
    expect(await plane.snapshot()).toEqual({ 'brinco-1': 1_000_000_000 });
  });

  it('devolve null quando nenhum id conhecido aparece, e não objeto vazio', async () => {
    const { plane } = montar(() => ok({ stock: { 'só-desconhecido': 1 } }));
    expect(await plane.snapshot()).toBeNull();
  });

  it('devolve null quando `stock` não é objeto', async () => {
    const corpos: Array<[string, unknown]> = [
      ['ausente', {}],
      ['nulo', { stock: null }],
      ['array', { stock: [1, 2] }],
      ['texto', { stock: 'brinco-1:5' }],
      ['número', { stock: 5 }],
    ];
    for (const [nome, body] of corpos) {
      const { plane } = montar(() => ok(body as Record<string, unknown>));
      expect(await plane.snapshot(), nome).toBeNull();
    }
  });
});

describe('HttpDataPlane: cache, reserva de voo e degradação', () => {
  it('dentro do TTL não faz segunda ida ao vizinho', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-12T12:00:00Z'));
    const { plane, chamadas } = montar(() => ok({ stock: { 'brinco-1': 5 } }));

    await plane.snapshot();
    vi.setSystemTime(new Date('2026-10-12T12:00:04Z'));
    await plane.snapshot();
    await plane.snapshot();

    expect(chamadas).toHaveLength(1);
  });

  it('vencido o TTL, consulta de novo', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-12T12:00:00Z'));
    const { plane, chamadas } = montar(() => ok({ stock: { 'brinco-1': 5 } }));

    await plane.snapshot();
    vi.setSystemTime(new Date('2026-10-12T12:00:06Z'));
    await plane.snapshot();

    expect(chamadas).toHaveLength(2);
  });

  it('leituras simultâneas compartilham uma ida só', async () => {
    let liberar!: (resultado: InternalCallResult) => void;
    const pendente = new Promise<InternalCallResult>((resolve) => { liberar = resolve; });
    const chamadas: number[] = [];
    const client = {
      target: ALVO,
      call: () => { chamadas.push(1); return pendente; },
    } as unknown as InternalClient;
    const plane = new HttpDataPlane(client, { allowedIds: CATALOGO });

    const leituras = Promise.all(Array.from({ length: 8 }, () => plane.snapshot()));
    await new Promise((resolve) => setImmediate(resolve));
    liberar(ok({ stock: { 'brinco-1': 5 } }));
    const resultados = await leituras;

    // Sem reserva de voo, 8 visitantes simultâneos virariam 8 chamadas contra
    // o vizinho — o modelo clássico de "thundering herd".
    expect(chamadas).toHaveLength(1);
    for (const resultado of resultados) expect(resultado).toEqual({ 'brinco-1': 5 });
  });

  it('queda curta serve o cache velho em vez de derrubar a loja', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-12T12:00:00Z'));
    const { plane } = montar((indice) => (indice === 0
      ? ok({ stock: { 'brinco-1': 5 } })
      : { ok: false, status: 0, body: null, failure: 'conexão recusada' }));

    const primeiro = await plane.snapshot();
    vi.setSystemTime(new Date('2026-10-12T12:00:10Z'));
    const segundo = await plane.snapshot();

    expect(primeiro).toEqual({ 'brinco-1': 5 });
    expect(segundo).toEqual({ 'brinco-1': 5 });
  });

  it('depois da janela de defasagem aceitável, devolve null', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-12T12:00:00Z'));
    const { plane } = montar((indice) => (indice === 0
      ? ok({ stock: { 'brinco-1': 5 } })
      : { ok: false, status: 0, body: null, failure: 'conexão recusada' }),
    { staleMs: 60_000 });

    await plane.snapshot();
    vi.setSystemTime(new Date('2026-10-12T12:01:01Z'));
    expect(await plane.snapshot()).toBeNull();
  });

  it('sem cache prévio, falha não inventa estoque', async () => {
    const { plane } = montar(() => ({ ok: false, status: 0, body: null, failure: 'timeout' }));
    expect(await plane.snapshot()).toBeNull();
  });

  it('resposta em formato errado cai no cache velho, não vira estoque', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-12T12:00:00Z'));
    const { plane } = montar((indice) => (indice === 0
      ? ok({ stock: { 'brinco-1': 5 } })
      : ok({ stock: { 'brinco-1': 'muitos' } })));

    await plane.snapshot();
    vi.setSystemTime(new Date('2026-10-12T12:00:10Z'));

    expect(await plane.snapshot()).toEqual({ 'brinco-1': 5 });
  });
});

describe('HttpDataPlane: o pré-pedido repassa só o formato público', () => {
  const pedidoPublico = {
    orderNumber: 'LOLA-20261012-8F3A1C0D2B4E',
    createdAt: '2026-10-12T12:00:00.000Z',
    status: 'awaiting_payment_setup',
    paymentStatus: 'not_configured',
    paymentMethod: 'pix',
    shippingOptionId: 'pac',
    itemCount: 1,
    subtotal: 12000,
    discount: 0,
    shipping: 2500,
    giftWrap: 0,
    total: 14500,
  };

  it('aceita resposta válida e devolve o pedido público', async () => {
    const { plane } = montar(() => ok({ success: true, order: pedidoPublico }, 201));
    const resultado = await plane.createDraft({ qualquer: 'coisa' }, { ip: '127.0.0.1' });
    expect(resultado).toEqual({ status: 201, body: { success: true, order: pedidoPublico } });
  });

  it('remove campo extra que o vizinho tenha mandado no pedido', async () => {
    // Se repassássemos o objeto como está, um vazamento acidental de PII do
    // outro lado viraria vazamento público aqui. A vitrine impõe o contrato.
    const { plane } = montar(() => ok({
      success: true,
      order: {
        ...pedidoPublico,
        customer: { fullName: 'Maria da Silva', phone: '11987654321' },
        notaInterna: 'não mostrar ao cliente',
        __proto__: { poluido: true },
      },
    }, 201));

    const resultado = await plane.createDraft({}, { ip: '127.0.0.1' });
    const order = (resultado.body as { order: Record<string, unknown> }).order;

    expect(Object.keys(order).sort()).toEqual(Object.keys(pedidoPublico).sort());
    expect(order.customer).toBeUndefined();
    expect(order.notaInterna).toBeUndefined();
    expect(({} as Record<string, unknown>).poluido).toBeUndefined();
    expect(JSON.stringify(resultado.body)).not.toContain('11987654321');
    expect(JSON.stringify(resultado.body)).not.toContain('Maria');
  });

  it('201 com `success` diferente de true não vira pedido', async () => {
    const { plane } = montar(() => ok({ success: false, order: pedidoPublico, error: 'recusado' }, 201));
    const resultado = await plane.createDraft({}, { ip: '127.0.0.1' });
    // 201 não é status de erro: a resposta se invalida por inteiro em vez de
    // virar um 503 carregado com a mensagem de recusa de negócio.
    expect(resultado).toEqual({ status: 503, body: { error: PEDIDOS_INDISPONIVEL } });
  });

  it('201 com pedido incompleto vira 503 genérico', async () => {
    const camposFaltando = Object.keys(pedidoPublico).filter((campo) => campo !== 'total');
    for (const campo of camposFaltando) {
      const order = { ...pedidoPublico } as Record<string, unknown>;
      delete order[campo];
      const { plane } = montar(() => ok({ success: true, order }, 201));
      const resultado = await plane.createDraft({}, { ip: '127.0.0.1' });
      expect(resultado, campo).toEqual({ status: 503, body: { error: PEDIDOS_INDISPONIVEL } });
    }
  });

  it('pedido que é array ou texto não passa', async () => {
    for (const order of [[pedidoPublico], 'pedido', 7, null]) {
      const { plane } = montar(() => ok({ success: true, order }, 201));
      const resultado = await plane.createDraft({}, { ip: '127.0.0.1' });
      expect(resultado, String(order)).toEqual({ status: 503, body: { error: PEDIDOS_INDISPONIVEL } });
    }
  });

  it('devolve recusa do vizinho com status e mensagem', async () => {
    const { plane } = montar(() => ok({ error: 'Estoque insuficiente.' }, 409));
    const resultado = await plane.createDraft({}, { ip: '127.0.0.1' });
    expect(resultado).toEqual({ status: 409, body: { error: 'Estoque insuficiente.' } });
  });

  it('limpa caracteres de controle da mensagem antes de mostrar', async () => {
    const { plane } = montar(() => ok({ error: 'Sem\u0000 estoque\u001b[31m\u0007.' }, 409));
    const resultado = await plane.createDraft({}, { ip: '127.0.0.1' });
    expect(resultado).toEqual({ status: 409, body: { error: 'Sem estoque[31m.' } });
    expect(resultado.body).not.toHaveProperty('error', expect.stringContaining('\u0000'));
  });

  it('mensagem longa demais não é repassada', async () => {
    const { plane } = montar(() => ok({ error: 'x'.repeat(401) }, 400));
    const resultado = await plane.createDraft({}, { ip: '127.0.0.1' });
    expect(resultado).toEqual({ status: 503, body: { error: PEDIDOS_INDISPONIVEL } });
  });

  it('mensagem que não é texto não é repassada', async () => {
    for (const error of [{ detalhe: 'vazamento' }, ['a', 'b'], 42, true, null, undefined]) {
      const { plane } = montar(() => ok({ error }, 400));
      const resultado = await plane.createDraft({}, { ip: '127.0.0.1' });
      expect(resultado, JSON.stringify(error)).toEqual({
        status: 503, body: { error: PEDIDOS_INDISPONIVEL },
      });
    }
  });

  it('status fora da faixa de erro vira 503 genérico', async () => {
    for (const status of [200, 302, 399, 600, 1000]) {
      const { plane } = montar(() => ok({ error: 'algo' }, status));
      const resultado = await plane.createDraft({}, { ip: '127.0.0.1' });
      expect(resultado, String(status)).toEqual({
        status: 503, body: { error: PEDIDOS_INDISPONIVEL },
      });
    }
  });

  it('falha de transporte vira 503 sem vazar nada do vizinho', async () => {
    const { plane } = montar(() => ({
      ok: false, status: 0, body: null,
      failure: 'http://10.0.0.9:4300 falhou com ECONNREFUSED',
    }));
    const resultado = await plane.createDraft({ pedido: 'real' }, { ip: '127.0.0.1' });

    expect(resultado).toEqual({ status: 503, body: { error: PEDIDOS_INDISPONIVEL } });
    const serializado = JSON.stringify(resultado);
    expect(serializado).not.toContain('10.0.0.9');
    expect(serializado).not.toContain('ECONNREFUSED');
    expect(serializado).not.toContain('real');
  });

  it('encaminha o corpo ao vizinho sem o alterar', async () => {
    const corpo = { customer: { fullName: 'Maria' }, items: [{ productId: 'brinco-1', quantity: 1 }] };
    const { plane, chamadas } = montar(() => ok({ error: 'recusado' }, 400));
    await plane.createDraft(corpo, { ip: '127.0.0.1' });

    expect(chamadas[0]).toEqual({ method: 'POST', path: '/internal/pedidos', body: corpo });
    expect(chamadas[0].body).toBe(corpo);
  });
});

describe('HttpDataPlane: recusa em série não enche o log', () => {
  it('registra no máximo uma linha por motivo dentro do intervalo', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-12T12:00:00Z'));
    const { plane } = montar(() => ({ ok: false, status: 0, body: null, failure: 'timeout' }));

    for (let i = 0; i < 50; i += 1) {
      await plane.snapshot();
      vi.setSystemTime(new Date(`2026-10-12T12:00:00.00${String(i).padStart(3, '0')}Z`));
    }

    // Sem orçamento, um flood de recusas geraria 50 linhas de log por segundo
    // e encheria o disco — que é exatamente o que a limitação evita.
    expect(logMock.mock.calls.length).toBeLessThanOrEqual(2);
  });
});
