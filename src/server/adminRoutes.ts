import express, { type Router, type RequestHandler } from 'express';
import { createAdminKeyMiddleware } from './adminAuth';
import { auditAdminAccess, log } from './logger';
import { type AdminAllowlist } from './ipAllow';
import { toAdminOrder } from './orders';
import { type LocalDataPlane } from './dataPlane';
import { type InternalShippingStatus } from './tracking';

/** Formato do número de pré-pedido emitido por `buildOrderDraft`. */
const ORDER_NUMBER_PATTERN = /^LOLA-\d{8}-[A-F0-9]{12}$/;

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

  // Catálogo: somente o servidor de dados persiste alterações.
  router.get('/admin/catalog', requireAdminKey, requireTrustedOrigin, (_req, res) => {
    // Estoque é lido da autoridade InventoryStore, nunca do snapshot auxiliar
    // gravado junto ao catálogo; assim o painel não exibe saldo desatualizado.
    const products = plane.catalogStore.list().map((product) => ({
      ...product,
      disponivel: plane.inventory.get(product.id)?.disponivel ?? 0,
    }));
    return res.json({ products });
  });

  router.post('/admin/catalog', requireAdminKey, requireTrustedOrigin, (req, res) => {
    const product = plane.createProduct(req.body);
    if (!product) return res.status(400).json({ error: 'Dados do produto inválidos ou limite do catálogo atingido.' });
    auditAdminAccess(req, 'allow', 'produto criado');
    return res.status(201).json({ product });
  });

  router.put('/admin/catalog/:productId', requireAdminKey, requireTrustedOrigin, (req, res) => {
    const { productId } = req.params;
    if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(productId)) {
      return res.status(400).json({ error: 'Identificador do produto inválido.' });
    }
    const product = plane.updateProduct(productId, req.body);
    if (!product) return res.status(400).json({ error: 'Produto não encontrado ou dados inválidos.' });
    auditAdminAccess(req, 'allow', 'produto atualizado');
    return res.json({ product });
  });

  router.delete('/admin/catalog/:productId', requireAdminKey, requireTrustedOrigin, (req, res) => {
    const { productId } = req.params;
    if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(productId)) {
      return res.status(400).json({ error: 'Identificador do produto inválido.' });
    }
    if (!plane.removeProduct(productId)) {
      return res.status(409).json({ error: 'Produto não pode ser removido: confira vendas, reservas ou estoque.' });
    }
    auditAdminAccess(req, 'allow', 'produto removido');
    return res.json({ success: true, productId });
  });

  router.post('/estoque/definir', requireAdminKey, requireTrustedOrigin, (req, res) => {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const result = plane.setProductStock(body.productId, body.quantidade);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    auditAdminAccess(req, 'allow', 'estoque ajustado');
    return res.json({ success: true, stock: result.stock });
  });

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
    if (!ORDER_NUMBER_PATTERN.test(req.params.orderNumber)) {
      return res.status(400).json({ error: 'Código de pré-pedido inválido.' });
    }
    const order = plane.orders.findByOrderNumber(req.params.orderNumber);
    if (!order) return res.status(404).json({ error: 'Pré-pedido não encontrado.' });
    return res.json({ order: toAdminOrder(order) });
  });

  /**
   * GET /api/admin/titular?telefone=...&nome=...
   *
   * Atende o art. 18, I (confirmar se existe tratamento dos dados) e o art. 18, V
   * (exportar): o titular não tem o número do pré-pedido em mãos, então telefone
   * ou nome é a única chave de entrada real. `count` é o total de registros
   * encontrados — é ele que responde "sim, temos"; `orders` vem truncado para a
   * resposta não virar exportação sem teto.
   *
   * Autenticação igual à das demais rotas: chave administrativa + origem na
   * allowlist. Um titular não chama isto — quem atende o pedido dele é o
   * operador, e toda chamada fica no log (`admin.access`).
   */
  router.get('/admin/titular', requireAdminKey, requireTrustedOrigin, (req, res) => {
    const telefone = typeof req.query.telefone === 'string' ? req.query.telefone : '';
    const nome = typeof req.query.nome === 'string' ? req.query.nome : '';
    if (!telefone.trim() && !nome.trim()) {
      return res.status(400).json({ error: 'Informe telefone ou nome do titular para buscar.' });
    }
    const matches = plane.orders.searchByTitular({ phone: telefone, name: nome });
    const truncated = matches.slice(0, 100);
    return res.json({
      count: matches.length,
      truncated: truncated.length < matches.length,
      orders: truncated.map(toAdminOrder),
    });
  });

  /**
   * POST /api/admin/pre-pedidos/:orderNumber/redact — LGPD, art. 18, VI.
   * Apaga nome, telefone e endereço; mantém número, data, itens e totais.
   */
  router.post('/admin/pre-pedidos/:orderNumber/redact', requireAdminKey, requireTrustedOrigin, (req, res) => {
    if (!ORDER_NUMBER_PATTERN.test(req.params.orderNumber)) {
      return res.status(400).json({ error: 'Código de pré-pedido inválido.' });
    }
    if (!plane.orders.redact(req.params.orderNumber)) {
      return res.status(404).json({ error: 'Pré-pedido não encontrado.' });
    }
    log('info', 'pedido.anonimizado', { numero: req.params.orderNumber, via: 'admin' });
    return res.json({ success: true, orderNumber: req.params.orderNumber, acao: 'anonimizado' });
  });

  /**
   * DELETE /api/admin/pre-pedidos/:orderNumber — LGPD, art. 18, VI.
   * Elimina o registro e reescreve o arquivo com a chave vigente.
   */
  router.delete('/admin/pre-pedidos/:orderNumber', requireAdminKey, requireTrustedOrigin, (req, res) => {
    if (!ORDER_NUMBER_PATTERN.test(req.params.orderNumber)) {
      return res.status(400).json({ error: 'Código de pré-pedido inválido.' });
    }
    if (!plane.orders.remove(req.params.orderNumber)) {
      return res.status(404).json({ error: 'Pré-pedido não encontrado.' });
    }
    log('info', 'pedido.eliminado', { numero: req.params.orderNumber, via: 'admin' });
    return res.json({ success: true, orderNumber: req.params.orderNumber, acao: 'eliminado' });
  });

  /**
   * POST /api/admin/rastreios/:orderNumber — rastreamento de envio.
   *
   * Sem corpo de atualização, cria o link do pedido: o token aleatório é
   * devolvido UMA vez (guarde e envie ao cliente por canal confiável) e só o
   * hash dele persiste. Com `status`, registra o evento logístico. A consulta
   * pública (`GET /api/rastreio/:token`) expõe apenas logística — nunca nome,
   * telefone ou endereço do cliente.
   */
  router.post('/admin/rastreios/:orderNumber', requireAdminKey, requireTrustedOrigin, (req, res) => {
    if (!plane.orders.ready || !plane.tracking.ready) {
      return res.status(503).json({ error: 'Armazenamento seguro indisponível.' });
    }
    const { orderNumber } = req.params;
    if (!ORDER_NUMBER_PATTERN.test(orderNumber)) {
      return res.status(400).json({ error: 'Número do pedido inválido.' });
    }
    if (!plane.orders.findByOrderNumber(orderNumber)) {
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    if (body.status !== undefined || body.carrierCode !== undefined || body.description !== undefined || body.location !== undefined) {
      if (typeof body.status !== 'string') {
        return res.status(400).json({ error: 'Informe um status de rastreamento válido.' });
      }
      const updated = plane.tracking.update(orderNumber, {
        status: body.status as InternalShippingStatus,
        ...(typeof body.carrierCode === 'string' ? { carrierCode: body.carrierCode } : {}),
        ...(typeof body.description === 'string' ? { description: body.description } : {}),
        ...(typeof body.location === 'string' ? { location: body.location } : {}),
      });
      if (!updated) {
        return res.status(400).json({ error: 'Não foi possível atualizar o rastreamento. Confira o status e o código.' });
      }
      return res.json({ tracking: updated });
    }
    const created = plane.tracking.create(orderNumber);
    if (!created) {
      return res.status(500).json({ error: 'Não foi possível criar o link de rastreamento.' });
    }
    log('info', 'rastreamento.criado', { numero: orderNumber, via: 'admin' });
    return res.status(201).json({
      tracking: created.tracking,
      trackingUrl: '/rastreio?token=' + encodeURIComponent(created.token),
      token: created.token,
    });
  });

  return router;
}
