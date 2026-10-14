import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRateLimitMiddleware } from '../rateLimit';

/**
 * Comportamento do rate limit sob RELÓGIO controlado.
 *
 * Os testes existentes provam a janela com tempo real (e um sono de 1,1 s);
 * aqui o relógio é falso — só `Date` — para exercitar a expiração da janela, o
 * `Retry-After` e a falha fechada da tabela cheia (VUL-F) de forma instantânea
 * e determinística. O middleware é o REAL; `req`/`res` aqui são apenas o
 * encurtamento do transporte, não um substituto do código testado.
 *
 * `Date` falso e nada mais: a chamada ao middleware é síncrona, então não há
 * rede nem timers envolvidos.
 */

interface Resultado {
  /** `true` quando o middleware chamou `next()` (requisição liberada). */
  liberada: boolean;
  status: number | null;
  headers: Record<string, string>;
  body: unknown;
}

function chamar(middleware: RequestHandler, ip: string): Resultado {
  const headers: Record<string, string> = {};
  const resultado: Resultado = { liberada: false, status: null, headers, body: null };

  const req = {
    ip,
    socket: { remoteAddress: ip },
    path: '/api/ai/consulta',
    baseUrl: '',
  } as unknown as Request;

  const res = {
    setHeader(chave: string, valor: string | number) {
      headers[chave.toLowerCase()] = String(valor);
      return res;
    },
    status(codigo: number) {
      resultado.status = codigo;
      return res;
    },
    json(valor: unknown) {
      resultado.body = valor;
      return res;
    },
  } as unknown as Response;

  const next: NextFunction = () => {
    resultado.liberada = true;
  };
  middleware(req, res, next);

  return resultado;
}

const T0 = new Date('2026-10-13T12:00:00.000Z');
const emSegundos = (deslocamentoMs: number) => new Date(T0.getTime() + deslocamentoMs);

afterEach(() => {
  vi.useRealTimers();
});

describe('createRateLimitMiddleware sob relógio falso', () => {
  it('expira a janela e zera a contagem do cliente quando o relógio passa dela', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    const mw = createRateLimitMiddleware({ windowMs: 60_000, maxRequests: 2 });

    expect(chamar(mw, '203.0.113.7').liberada).toBe(true);
    expect(chamar(mw, '203.0.113.7').liberada).toBe(true);
    const bloqueio = chamar(mw, '203.0.113.7');
    expect(bloqueio.status).toBe(429);

    // Passou a janela: é um cliente novo de novo — 2 liberadas, a 3ª bloqueia.
    vi.setSystemTime(emSegundos(60_000));
    expect(chamar(mw, '203.0.113.7').liberada).toBe(true);
    expect(chamar(mw, '203.0.113.7').liberada).toBe(true);
    expect(chamar(mw, '203.0.113.7').status).toBe(429);
  });

  it('Retry-After conta os segundos que restam da janela, diminuindo com o relógio', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    const mw = createRateLimitMiddleware({ windowMs: 60_000, maxRequests: 1 });

    chamar(mw, '198.51.100.9');
    expect(chamar(mw, '198.51.100.9').headers['retry-after']).toBe('60');

    vi.setSystemTime(emSegundos(30_000));
    expect(chamar(mw, '198.51.100.9').headers['retry-after']).toBe('30');

    vi.setSystemTime(emSegundos(59_500));
    expect(chamar(mw, '198.51.100.9').headers['retry-after']).toBe('1');
  });

  // VUL-F: tabela cheia recusa o bucket NOVO (falha fechada) em vez de ejetar
  // o mais antigo — e o relógio é o que devolve espaço. Sob relógio falso isto
  // se prova sem depender de sono de 1 s.
  it('tabela cheia recusa bucket novo, preserva o bucket existente e libera quando a janela vence', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    const mw = createRateLimitMiddleware({ windowMs: 60_000, maxRequests: 2, maxBuckets: 100 });

    // A vítima esgota o próprio teto: bucket dela em primeiro, cheio.
    expect(chamar(mw, 'vitima').liberada).toBe(true);
    expect(chamar(mw, 'vitima').liberada).toBe(true);
    expect(chamar(mw, 'vitima').status).toBe(429);

    // 99 IPs distintos completam os 100 slots da tabela.
    for (let index = 0; index < 99; index += 1) {
      expect(chamar(mw, `inundacao-${index}`).liberada, `inundacao-${index}`).toBe(true);
    }

    // Tabela cheia: o IP novo é RECUSADO — não pode abrir bucket nem ejetar ninguém.
    expect(chamar(mw, 'inundador-novo').status).toBe(429);

    // E o bucket da vítima NÃO foi zerado: ela continua bloqueada.
    expect(chamar(mw, 'vitima').status).toBe(429);

    // Vencida a janela, a varredura devolve espaço e o cliente novo entra.
    vi.setSystemTime(emSegundos(61_000));
    expect(chamar(mw, 'inundador-novo').liberada).toBe(true);
  });

  // Relógio anda para trás (NTP, VM restaurada): a janela não pode ENCURTAR.
  // O resultado é fail-closed — tudo continua bloqueado, nada é aceito duas vezes.
  it('relógio voltando no tempo mantém a falha fechada: nada é aceito além do teto', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    const mw = createRateLimitMiddleware({ windowMs: 60_000, maxRequests: 1, maxBuckets: 100 });

    expect(chamar(mw, '192.0.2.50').liberada).toBe(true);
    expect(chamar(mw, '192.0.2.50').status).toBe(429);

    // Com a tabela cheia, um relógio para trás não pode abrir espaço nem
    // devolver teto a quem já gastou o dele.
    for (let index = 0; index < 99; index += 1) chamar(mw, `fixo-${index}`);
    vi.setSystemTime(new Date(T0.getTime() - 10 * 60_000));
    expect(chamar(mw, '192.0.2.50').status).toBe(429);
    expect(chamar(mw, 'cliente-novo').status).toBe(429);

    // De volta ao fluxo normal: a janela original ancora no momento real da
    // primeira requisição e vence 60 s depois dela.
    vi.setSystemTime(emSegundos(59_000));
    expect(chamar(mw, '192.0.2.50').status).toBe(429);
    vi.setSystemTime(emSegundos(60_000));
    expect(chamar(mw, '192.0.2.50').liberada).toBe(true);
  });

  // VUL-02: os tetos horário e diário do assistente existem para cortar custo
  // REAL (chamadas pagas por dia). Se uma troca acidental de `windowMs` fizesse
  // o teto diário vencer a cada minuto, o oráculo de pagamento voltaria a
  // existir e ninguém perceberia até a fatura. Aqui o relógio prova a duração.
  it('teto diário dura um dia inteiro: não vence em 23 h e vence em 24 h', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    const mw = createRateLimitMiddleware({ windowMs: 24 * 60 * 60_000, maxRequests: 1 });

    expect(chamar(mw, '198.51.100.42').liberada).toBe(true);
    expect(chamar(mw, '198.51.100.42').status).toBe(429);

    vi.setSystemTime(emSegundos(23 * 60 * 60_000));
    expect(chamar(mw, '198.51.100.42').status).toBe(429);

    vi.setSystemTime(emSegundos(24 * 60 * 60_000));
    expect(chamar(mw, '198.51.100.42').liberada).toBe(true);
  });
});
