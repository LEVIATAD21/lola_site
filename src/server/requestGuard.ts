import type { RequestHandler } from 'express';

/**
 * Guarda de requisições cross-site.
 *
 * VUL-E: sem isto, um site malicioso disparava `POST` de formulário simples
 * (`text/plain` ou `application/x-www-form-urlencoded`, que não dispara
 * preflight contra um visitante qualquer) contra `/api/pedidos/rascunho` e
 * `/api/ai/consulta`. O corpo não parseava e o handler respondia 400, mas os
 * middlewares de limite por rota já tinham consumido os 10/min de pedido e os
 * 20/min de IA da IP da vítima — o checkout dela morria sem que ela clicasse em
 * nada. A guarda roda ANTES dos limites, então a requisição recusada não gasta
 * bucket de ninguém.
 *
 * Comportamento:
 * - `GET`/`HEAD`/`OPTIONS` passam: não mutam estado.
 * - Sem cabeçalho `Origin` passa: cliente sem navegador (curl, monitor de
 *   uptime, webhook) não envia, e exigir Origin quebraria integração legítima.
 * - `Origin` presente com host diferente do `Host` da requisição → 403.
 * - `Origin` malformado também → 403: quem manda Origin inválido não é
 *   navegador legítimo, e não faz sentido arriscar.
 */
export function createCrossSiteWriteGuard(): RequestHandler {
  return (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();

    const origin = req.get('origin');
    if (!origin) return next();

    let originHost: string | undefined;
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = undefined;
    }

    if (!originHost || originHost !== req.get('host')) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(403).json({ error: 'Origem não autorizada.' });
    }
    return next();
  };
}
