import express, { type Router } from 'express';
import { createInternalAuthMiddleware } from './internalAuth';
import { createRateLimitMiddleware } from './rateLimit';
import { type LocalDataPlane } from './dataPlane';
import { log } from './logger';

/**
 * API do servidor de dados voltada ao site público.
 *
 * Este router é o **único** lugar de onde o site público lê estoque e escreve
 * pré-pedido. Ele é montado somente no `data-server.ts` — o site público não o
 * expõe, e o servidor de dados não expõe nada fora dele (além da saúde e das
 * rotas administrativas, que têm autenticação própria).
 *
 * Ordem dos middlewares, do mais barato ao mais caro:
 *   1. rate limit por IP do socket  — corta inundação antes de qualquer CPU;
 *   2. `express.raw`                — captura os bytes que serão assinados;
 *   3. autenticação HMAC            — só então a requisição é considerada real.
 */
export interface InternalRouterOptions {
  plane: LocalDataPlane;
  secret: string;
  skewMs?: number;
  maxNonces?: number;
  perMinute?: number;
}

export function createInternalRouter(options: InternalRouterOptions): Router {
  const router = express.Router();

  // Chave sempre pelo endereço do socket: o servidor de dados não fica atrás de
  // proxy nenhum, e confiar em X-Forwarded-For aqui daria balde novo por requisição.
  router.use(createRateLimitMiddleware({
    windowMs: 60_000,
    maxRequests: options.perMinute ?? 10_000,
    maxBuckets: 20_000,
    keyGenerator: (req) => (req.socket.remoteAddress || 'unknown') + '|' + req.path,
    message: 'Limite temporário de chamadas internas atingido.',
  }));

  // `type: '*/*'` para que o corpo seja capturado mesmo sem Content-Type: o
  // HMAC cobre os bytes recebidos, então qualquer mídia é verificável. Acima de
  // 16 kb o body-parser recusa antes de consumir memória.
  router.use(express.raw({ type: '*/*', limit: '16kb' }));
  router.use(createInternalAuthMiddleware({
    secret: options.secret,
    skewMs: options.skewMs,
    maxNonces: options.maxNonces,
  }));

  router.get('/estoque', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    void options.plane.snapshot()
      .then((stock) => res.json({ stock: stock ?? {} }))
      .catch((error: unknown) => {
        log('error', 'interno.estoque_falhou', {
          ip: req.socket.remoteAddress || 'desconhecido',
          motivo: error instanceof Error ? error.message : String(error),
        });
        res.status(503).json({ error: 'Estoque temporariamente indisponível.' });
      });
  });

  router.post('/pedidos', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    let body: unknown = {};
    if (Buffer.isBuffer(req.body)) {
      const text = req.body.toString('utf8');
      if (text.trim()) {
        try {
          body = JSON.parse(text);
        } catch {
          res.status(400).json({ error: 'JSON inválido na requisição.' });
          return;
        }
      }
    }
    void options.plane.createDraft(body, { ip: req.ip || '' })
      .then((result) => res.status(result.status).json(result.body))
      .catch((error: unknown) => {
        log('error', 'interno.pedido_falhou', {
          ip: req.socket.remoteAddress || 'desconhecido',
          motivo: error instanceof Error ? error.message : String(error),
        });
        res.status(503).json({ error: 'O registro de pré-pedidos está temporariamente indisponível.' });
      });
  });

  return router;
}
