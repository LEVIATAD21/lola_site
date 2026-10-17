import express, { type RequestHandler, type Router } from 'express';
import { createRateLimitMiddleware } from './rateLimit';

/**
 * Consulta pública de CEP da vitrine (RT-R-04).
 *
 * O navegador nunca fala com o ViaCEP: em produção o CSP da vitrine só permite
 * `connect-src 'self'` (securityHeaders.ts), então o fetch direto para
 * `viacep.com.br` era recusado pelo próprio navegador antes de sair da
 * máquina. A chamada externa passa a sair daqui — o endereço chega ao front
 * pela mesma origem, sem abrir exceção de CSP e sem expor a cliente a script
 * de terceiro.
 */

/** Timeout da consulta externa: chamada pendurada segura socket e balde de rate limit. */
const VIACEP_TIMEOUT_MS = 5_000;

/**
 * Só os 8 dígitos. Aceita hífen e outros separadores, porque o formulário do
 * checkout pode enviar `26300-000` ou `26300000` — a normalização é a mesma dos
 * dois lados da API.
 */
export function normalizeCep(input: string): string | null {
  const cep = input.replace(/\D/g, '');
  return /^\d{8}$/.test(cep) ? cep : null;
}

export interface CepAddress {
  cep: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
}

type CepLookupResult =
  | { status: 'ok'; address: CepAddress }
  | { status: 'not_found' }
  | { status: 'unavailable' };

/**
 * Consulta o ViaCEP no servidor. Distingue dado de transporte:
 * `erro: true` do upstream significa "CEP não existe" (`not_found`); falha de
 * rede, timeout, status fora do 200 e payload incompleto são indisponibilidade.
 * Quem decide o status HTTP é o handler — aqui não há `res`.
 */
async function lookupOnViaCep(cep: string): Promise<CepLookupResult> {
  let response: Response;
  try {
    response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(VIACEP_TIMEOUT_MS),
    });
  } catch {
    // Rede fora, DNS, timeout: a resposta pública não pode revelar detalhe
    // interno — o motivo real não interessa a quem consulta CEP.
    return { status: 'unavailable' };
  }
  if (!response.ok) return { status: 'unavailable' };

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { status: 'unavailable' };
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { status: 'unavailable' };
  }

  const address = payload as Record<string, unknown>;
  // O ViaCEP usa `erro: true` (e às vezes a string) para CEP inexistente.
  if (address.erro === true || address.erro === 'true') return { status: 'not_found' };

  const city = typeof address.localidade === 'string' ? address.localidade.trim() : '';
  const state = typeof address.uf === 'string' ? address.uf.trim().toUpperCase() : '';
  // Sem cidade e UF o endereço não serve para preencher nada; é falha do
  // serviço, não "CEP não encontrado".
  if (!city || !/^[A-Z]{2}$/.test(state)) return { status: 'unavailable' };

  return {
    status: 'ok',
    address: {
      cep,
      street: typeof address.logradouro === 'string' ? address.logradouro.trim() : '',
      neighborhood: typeof address.bairro === 'string' ? address.bairro.trim() : '',
      city,
      state,
    },
  };
}

const handleCepLookup: RequestHandler = async (req, res) => {
  // Endereço em resposta é dado de localização da cliente; não pode ficar em
  // cache de proxy intermediário. O middleware global de `/api` também marca,
  // mas a rota declara o próprio contrato (mesmo padrão de /api/estoque/:id).
  res.setHeader('Cache-Control', 'no-store');

  const cep = normalizeCep(req.params.cep ?? '');
  if (!cep) {
    return res.status(400).json({ error: 'Informe um CEP brasileiro válido com 8 dígitos.' });
  }

  const result = await lookupOnViaCep(cep);
  if (result.status === 'ok') return res.json(result.address);
  if (result.status === 'not_found') return res.status(404).json({ error: 'CEP não encontrado.' });
  return res.status(502).json({ error: 'Não foi possível consultar o CEP agora. Tente novamente.' });
};

/**
 * Router da consulta de CEP, montado na vitrine sob `/api` →
 * `GET /api/cep/:cep`. O teto de 20/min por IP existe porque cada consulta
 * gasta uma chamada a um serviço externo: generoso para quem digita o CEP,
 * apertado para script que varra a faixa inteira.
 */
export function createCepLookupRouter(): Router {
  const router = express.Router();
  router.get('/cep/:cep', createRateLimitMiddleware({
    windowMs: 60_000,
    maxRequests: 20,
    message: 'Muitas consultas de CEP. Tente novamente em um minuto.',
  }), handleCepLookup);
  return router;
}
