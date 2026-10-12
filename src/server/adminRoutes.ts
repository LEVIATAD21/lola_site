import express, { type Router, type RequestHandler } from 'express';
import { createAdminKeyMiddleware } from './adminAuth';
import { auditAdminAccess } from './logger';
import { type AdminAllowlist } from './ipAllow';
import { toAdminOrder } from './orders';
import { type LocalDataPlane } from './dataPlane';

/**
 * Rotas administrativas — aqui ficam, e **nunca** no site público.
 *
 * Este é o ponto inteiro da separação: o painel de controle mora no servidor
 * que tem os dados, numa rede privada, e o servidor de dados não é alcançável
 * de fora. Se por algum motivo alguém chegar até ele, ainda há duas travas
 * independentes em cada rota:
 *
 *   1. chave administrativa, comparada em tempo constante, com limite de
 *      tentativas por IP e resposta idêntica para "chave errada" e "chave não
 *      configurada" (VUL-11);
 *   2. allowlist de origem, que só existe no servidor de dados.
 *
 * Ordem proposital: a chave vem antes da origem. Quem não tem a chave recebe o
 * mesmo 401 de sempre e não aprende nada sobre como a rede está segmentada.
 */
export interface AdminRouterOptions {
  plane: LocalDataPlane;
  allowlist: AdminAllowlist;
}

export function createAdminRouter(options: AdminRouterOptions): Router {
  const router = express.Router();
  const requireAdminKey = createAdminKeyMiddleware();
  const { plane, allowlist } = options;

  const requireTrustedOrigin: RequestHandler = (req, res, next) => {
    const origin = req.socket.remoteAddress || req.ip || '';
    if (!allowlist.check(origin)) {
      auditAdminAccess(req, 'denied', 'origem fora de LOLA_ADMIN_ALLOWED_IPS');
      return res.status(403).json({ error: 'Origem não autorizada para esta operação.' });
    }
    return next();
  };

  // POST /api/estoque/atualizar — baixa estrita e persistente.
  router.post('/estoque/atualizar', requireAdminKey, requireTrustedOrigin, (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const result = plane.inventory.deduct(body.productId, body.quantidade);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    return res.json({
      success: true,
      productId: result.stock.productId,
      novoDisponivel: result.stock.disponivel,
      vendido: result.stock.vendido,
    });
  });

  // GET /api/admin/pre-pedidos?limit=50
  router.get('/admin/pre-pedidos', requireAdminKey, requireTrustedOrigin, (req, res) => {
    const requestedLimit = Number(req.query.limit ?? 50);
    const limit = Number.isSafeInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;
    return res.json({ orders: plane.orders.listRecent(limit).map(toAdminOrder) });
  });

  // GET /api/admin/pre-pedidos/:orderNumber
  router.get('/admin/pre-pedidos/:orderNumber', requireAdminKey, requireTrustedOrigin, (req, res) => {
    if (!/^LOLA-\d{8}-[A-F0-9]{12}$/.test(req.params.orderNumber)) {
      return res.status(400).json({ error: 'Código de pré-pedido inválido.' });
    }
    const order = plane.orders.findByOrderNumber(req.params.orderNumber);
    if (!order) return res.status(404).json({ error: 'Pré-pedido não encontrado.' });
    return res.json({ order: toAdminOrder(order) });
  });

  return router;
}
