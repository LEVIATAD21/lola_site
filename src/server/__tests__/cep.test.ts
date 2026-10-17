import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCepLookupRouter } from '../cepLookup';

/**
 * A consulta de CEP da vitrine (RT-R-04) pelo caminho HTTP real: um app Express
 * com o MESMO router que o `server.ts` monta, atendido de verdade em loopback.
 * O único dublê é o upstream `viacep.com.br`, via `vi.stubGlobal('fetch')` —
 * o dublê deixa passar só o que é loopback, que é o cliente HTTP deste teste.
 *
 * Processo filho não serve aqui: o `fetch` global que precisa ser dublado roda
 * no processo que atende a rota, e o interesse desta suíte é o contrato HTTP
 * da rota (validação, mapeamento, timeout e 429), não o boot do entrypoint.
 */

const fetchReal = globalThis.fetch.bind(globalThis);

type Upstream = (url: string, init?: RequestInit) => Promise<Response>;

/** Instala o dublê do ViaCEP; o espião devolvido expõe URL e opções da consulta. */
function dublarViaCep(upstream: Upstream) {
  // O espião envolve SÓ o upstream: as chamadas de loopback são o cliente HTTP
  // deste teste e não podem poluir as asserções sobre a consulta externa.
  const espiao = vi.fn(upstream);
  vi.stubGlobal('fetch', (entrada: string | URL | Request, init?: RequestInit) => {
    const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
    if (url.startsWith('http://127.0.0.1')) return fetchReal(entrada, init);
    return espiao(url, init);
  });
  return espiao;
}

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Como o ViaCEP responde para 26300-000 (Queimados/RJ). */
const ENDERECO_VIA_CEP = {
  cep: '26300-000',
  logradouro: 'Rua das Flores',
  bairro: 'Centro',
  localidade: 'Queimados',
  uf: 'RJ',
};

/** Como a rota interna devolve para o front (BrazilianCepAddress). */
const ENDERECO_PUBLICO = {
  cep: '26300000',
  street: 'Rua das Flores',
  neighborhood: 'Centro',
  city: 'Queimados',
  state: 'RJ',
};

const MENSAGEM_INDISPONIVEL = 'Não foi possível consultar o CEP agora. Tente novamente.';

async function subirApp(): Promise<{ base: string; fechar: () => Promise<void> }> {
  const app = express();
  app.use('/api', createCepLookupRouter());
  const servidor = await new Promise<Server>((resolve) => {
    const escutando = app.listen(0, '127.0.0.1', () => resolve(escutando));
  });
  const { port } = servidor.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    fechar: () => new Promise((resolve, reject) => {
      servidor.close((erro) => (erro ? reject(erro) : resolve()));
    }),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('GET /api/cep/:cep', () => {
  it('consulta o ViaCEP no servidor e devolve o endereço no formato do front', async () => {
    const upstream = dublarViaCep(async () => respostaJson(ENDERECO_VIA_CEP));
    const { base, fechar } = await subirApp();
    try {
      const comHifen = await fetch(`${base}/api/cep/26300-000`);
      expect(comHifen.status).toBe(200);
      expect(comHifen.headers.get('cache-control')).toBe('no-store');
      expect(await comHifen.json()).toEqual(ENDERECO_PUBLICO);

      // Sem hífen é o mesmo CEP: a rota aceita os dois formatos.
      const semHifen = await fetch(`${base}/api/cep/26300000`);
      expect(semHifen.status).toBe(200);
      expect(await semHifen.json()).toEqual(ENDERECO_PUBLICO);

      expect(upstream).toHaveBeenCalledTimes(2);
      for (const [url, init] of upstream.mock.calls) {
        expect(url).toBe('https://viacep.com.br/ws/26300000/json/');
        expect(init?.headers).toEqual({ Accept: 'application/json' });
        // Sem signal não há timeout: upstream pendurado segura socket e balde.
        expect(init?.signal).toBeInstanceOf(AbortSignal);
      }
    } finally {
      await fechar();
    }
  });

  it('recusa CEP fora do formato com 400, sem chamar o ViaCEP', async () => {
    const upstream = dublarViaCep(async () => respostaJson(ENDERECO_VIA_CEP));
    const { base, fechar } = await subirApp();
    try {
      for (const invalido of ['1234', '12A45-678', '123456789']) {
        const resposta = await fetch(`${base}/api/cep/${invalido}`);
        expect(resposta.status, invalido).toBe(400);
        expect(await resposta.json()).toEqual({
          error: 'Informe um CEP brasileiro válido com 8 dígitos.',
        });
      }
      expect(upstream).not.toHaveBeenCalled();
    } finally {
      await fechar();
    }
  });

  it('traduz {"erro": true} do ViaCEP em 404', async () => {
    dublarViaCep(async () => respostaJson({ erro: true }));
    const { base, fechar } = await subirApp();
    try {
      const resposta = await fetch(`${base}/api/cep/99999999`);
      expect(resposta.status).toBe(404);
      expect(await resposta.json()).toEqual({ error: 'CEP não encontrado.' });
    } finally {
      await fechar();
    }
  });

  it('devolve 502 quando a chamada externa falha ou o ViaCEP responde erro', async () => {
    dublarViaCep(async () => { throw new TypeError('fetch failed'); });
    const primeiro = await subirApp();
    try {
      const resposta = await fetch(`${primeiro.base}/api/cep/26300000`);
      expect(resposta.status).toBe(502);
      expect(await resposta.json()).toEqual({ error: MENSAGEM_INDISPONIVEL });
    } finally {
      await primeiro.fechar();
    }

    // 5xx do upstream é indisponibilidade, não "CEP não encontrado".
    dublarViaCep(async () => new Response('erro', { status: 503 }));
    const segundo = await subirApp();
    try {
      const resposta = await fetch(`${segundo.base}/api/cep/26300000`);
      expect(resposta.status).toBe(502);
    } finally {
      await segundo.fechar();
    }
  });

  it('devolve 502 quando o payload do ViaCEP vem incompleto ou não-objeto', async () => {
    dublarViaCep(async () => respostaJson({ logradouro: 'Rua sem cidade' }));
    const primeiro = await subirApp();
    try {
      const resposta = await fetch(`${primeiro.base}/api/cep/26300000`);
      expect(resposta.status).toBe(502);
      expect(await resposta.json()).toEqual({ error: MENSAGEM_INDISPONIVEL });
    } finally {
      await primeiro.fechar();
    }

    dublarViaCep(async () => respostaJson(['lista', 'inesperada']));
    const segundo = await subirApp();
    try {
      const resposta = await fetch(`${segundo.base}/api/cep/26300000`);
      expect(resposta.status).toBe(502);
    } finally {
      await segundo.fechar();
    }
  });

  it('devolve 502 quando o ViaCEP estoura o timeout', async () => {
    dublarViaCep(async () => {
      // Mesma forma do erro que o fetch real lança quando o AbortSignal dispara.
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    });
    const { base, fechar } = await subirApp();
    try {
      const resposta = await fetch(`${base}/api/cep/26300000`);
      expect(resposta.status).toBe(502);
      expect(await resposta.json()).toEqual({ error: MENSAGEM_INDISPONIVEL });
    } finally {
      await fechar();
    }
  });

  it('limita a 20 consultas por minuto por IP', async () => {
    dublarViaCep(async () => respostaJson(ENDERECO_VIA_CEP));
    const { base, fechar } = await subirApp();
    try {
      for (let consulta = 1; consulta <= 20; consulta += 1) {
        const resposta = await fetch(`${base}/api/cep/26300000`);
        expect(resposta.status, `consulta ${consulta}`).toBe(200);
        await resposta.arrayBuffer();
      }
      const excedente = await fetch(`${base}/api/cep/26300000`);
      expect(excedente.status).toBe(429);
      expect(excedente.headers.get('cache-control')).toBe('no-store');
      expect(excedente.headers.get('retry-after')).toBeTruthy();
      expect(await excedente.json()).toEqual({
        error: 'Muitas consultas de CEP. Tente novamente em um minuto.',
      });
    } finally {
      await fechar();
    }
  });
});
