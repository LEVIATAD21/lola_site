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
 * - `Origin` presente com esquema, host ou porta diferente da origem efetiva → 403.
 * - `Origin` malformado também → 403: quem manda Origin inválido não é
 *   navegador legítimo, e não faz sentido arriscar.
 */
export function createCrossSiteWriteGuard(): RequestHandler {
  return (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();

    const origin = req.get('origin');
    if (!origin) return next();

    let originUrl: URL | undefined;
    let requestOrigin: string | undefined;
    try {
      originUrl = new URL(origin);
      const requestHost = req.get('host');
      if (requestHost) requestOrigin = new URL(`${req.protocol}://${requestHost}`).origin;
    } catch {
      originUrl = undefined;
      requestOrigin = undefined;
    }

    // Origin é schemeful: aceitar o mesmo host em HTTP quando a requisição é
    // HTTPS abre uma janela de CSRF por downgrade. req.protocol respeita apenas
    // os proxies explicitamente confiáveis configurados pelo entrypoint.
    if (!originUrl || originUrl.username || originUrl.password ||
        !requestOrigin || originUrl.origin !== requestOrigin) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(403).json({ error: 'Origem não autorizada.' });
    }
    return next();
  };
}
