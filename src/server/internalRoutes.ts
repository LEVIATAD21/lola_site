import express, { type Router } from 'express';
import {
  createInternalAuthMiddleware, INTERNAL_NONCE_HEADER, INTERNAL_RESPONSE_SIG_HEADER,
  signInternalResponse,
} from './internalAuth';
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
 *   3. autenticação HMAC            — só então a requisição é considerada real;
 *   4. assinatura de resposta       — `res.json` passa a carregar `x-lola-resp-sig`.
 *
 * A assinatura de resposta existe porque a rede entre os dois processos não é
 * confiável por princípio: sem ela, um atacante nela forjava `201` de
 * pré-pedido e estoque falsificado. Recusas ANTES do passo 4 (429 do rate
 * limit, 401 da autenticação) não são assinadas — o cliente as trata como
 * falha de transporte, que já era o efeito prático delas.
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
  //
  // Sem o caminho na chave. Este router tem duas rotas fixas, mas o middleware
  // roda em `router.use`, ou seja, alcança QUALQUER caminho sob /internal — e
  // um atacante na rede privada inventando caminhos multiplicaria a permissão
  // de 10.000/min por rota nova e inflaria o mapa de baldes. O teto passa a ser
  // por origem, inteiro.
  router.use(createRateLimitMiddleware({
    windowMs: 60_000,
    maxRequests: options.perMinute ?? 10_000,
    maxBuckets: 20_000,
    keyGenerator: (req) => req.socket.remoteAddress || 'unknown',
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

  // Toda resposta autenticada sai assinada: HMAC sobre o nonce da requisição,
  // o status e o digesto do corpo serializado. O wrapper intercepta `res.json`,
  // que é como todo handler deste router responde; `JSON.stringify` aqui é o
  // mesmo que o Express usa, então o digesto bate byte a byte com o enviado.
  router.use((req, res, next) => {
    const nonce = req.get(INTERNAL_NONCE_HEADER) ?? '';
    const jsonOriginal = res.json.bind(res);
    res.json = (body: unknown) => {
      const serialized = Buffer.from(JSON.stringify(body ?? null) ?? '', 'utf8');
      res.setHeader(
        INTERNAL_RESPONSE_SIG_HEADER,
        signInternalResponse(options.secret, { nonce, status: res.statusCode, body: serialized }),
      );
      return jsonOriginal(body);
    };
    next();
  });

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
