import path from 'node:path';
import { InventoryStore, type HoldLimits } from './inventory';
import { type CatalogInfo } from './catalog';
import { CatalogStore } from './catalogStore';
import { buildOrderDraft, EncryptedOrderStore, toPublicOrder } from './orders';
import { TrackingStore } from './tracking';
import { createInitialStock } from './stock';
import { log, loggableIp } from './logger';

/**
 * Plano de dados da loja.
 *
 * A loja foi separada do armazenamento de propósito: o site público serve a
 * vitrine, e quem detém estoque, pré-pedidos e a chave de cifra é o servidor de
 * dados. Esta interface é o contrato entre eles — com duas implementações:
 *
 *  - `LocalDataPlane`  : a autoridade real, no processo que tem os arquivos.
 *  - `HttpDataPlane`   : o proxy do site público, que só conversa por HTTP
 *                        autenticado com o servidor de dados.
 *
 * A separação existe para que comprometer o site público não entregue a base.
 * Nenhum dos dois lados confia no outro pela rede: validação, reserva e
 * persistência acontecem sempre no lado do plano de dados.
 */

/** Resposta crua do plano de dados: status HTTP + corpo já serializável. */
export interface DataPlaneResult {
  status: number;
  body: Record<string, unknown>;
}

export interface DataPlane {
  /**
   * Mapa `productId -> disponivel` (líquido de reservas ativas), ou `null`
   * quando o plano de dados não pôde ser consultado.
   */
  snapshot(): Promise<Record<string, number> | null>;
  /** Catálogo autoritativo, vindo do armazenamento privado. */
  catalog(): Promise<CatalogInfo[] | null>;
  /** Cria um pré-pedido. Autoridade única de validação, reserva e persistência. */
  createDraft(body: unknown, meta: { ip: string }): Promise<DataPlaneResult>;
}

/**
 * Mensagens de indisponibilidade.
 *
 * VUL-18: o motivo real (chave ausente, malformada, permissão errada, cifra
 * corrompida) só existe no log do operador. Qualquer diferença entre eles na
 * resposta vira um oráculo de configuração para visitante sem autenticação.
 */
export const PEDIDOS_INDISPONIVEL =
  'O registro de pré-pedidos está temporariamente indisponível. Tente novamente mais tarde ou fale com o atendimento.';
export const PLANO_DE_DADOS_INDISPONIVEL =
  'O catálogo está temporariamente indisponível. Recarregue a página em instantes.';
export const CAPACIDADE_ESGOTADA =
  'Capacidade de pré-pedidos esgotada. A loja precisa liberar espaço antes de novas solicitações.';
export const PEDIDOS_PERSISTENCIA_FALHOU =
  'Não foi possível salvar a solicitação com segurança. Tente novamente.';

export class LocalDataPlane implements DataPlane {
  readonly inventory: InventoryStore;
  readonly orders: EncryptedOrderStore;
  /**
   * Rastreamento de envio (`.data/tracking.enc.json`). A consulta pública usa
   * token não adivinhável e devolve só logística — nunca nome, telefone ou
   * endereço. A escrita fica atrás da chave administrativa, no router de
   * administração.
   */
  readonly tracking: TrackingStore;
  private readonly reservationTtlMs: number;
  readonly catalogStore: CatalogStore;

  constructor(inventory: InventoryStore, orders: EncryptedOrderStore, tracking: TrackingStore, catalogStore: CatalogStore, reservationTtlMs: number) {
    this.inventory = inventory;
    this.orders = orders;
    this.tracking = tracking;
    this.catalogStore = catalogStore;
    this.reservationTtlMs = reservationTtlMs;
  }

  async catalog(): Promise<CatalogInfo[] | null> {
    return this.catalogStore.list();
  }

  async snapshot(): Promise<Record<string, number> | null> {
    // Objeto sem protótipo: um id vindo de fora nunca pode alcançar
    // `Object.prototype`, mesmo que a fonte esteja corrompida.
    const stock: Record<string, number> = Object.create(null) as Record<string, number>;
    for (const item of this.inventory.list()) stock[item.productId] = item.disponivel;
    return stock;
  }

  async createDraft(body: unknown, meta: { ip: string }): Promise<DataPlaneResult> {
    if (!this.orders.ready) {
      return { status: 503, body: { error: PEDIDOS_INDISPONIVEL } };
    }
    // VUL-10: sem este check, o `false` do teto de 10k virava 500 genérico sem causa.
    if (this.orders.atCapacity) {
      return { status: 503, body: { error: CAPACIDADE_ESGOTADA } };
    }

    const result = buildOrderDraft(
      body, this.catalogStore.list(), this.inventory, undefined,
      // VUL-CUPOM: o teto de usos precisa de quem guarda os pré-pedidos. O
      // plano de dados tem o armazenamento, então a contagem vem dele.
      (code) => this.orders.couponUseCount(code),
    );
    if (!result.ok) return { status: result.status, body: { error: result.error } };

    // VUL-03: sem reserva, 12 pedidos de 5 unidades passavam todos contra 7 em
    // estoque, porque cada um voltava a enxergar o mesmo saldo. O handler é
    // síncrono, então validar e comprometer acontece sem interleave.
    const hold = this.inventory.placeHold(
      result.order.id,
      result.order.items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
      Date.now() + this.reservationTtlMs,
      Date.now(),
      // VUL-C: origem do cliente final. No modo embutido é o IP real; no
      // dividido vira o IP da vitrine (ver `holdLimits` de cada entrypoint).
      meta.ip || undefined,
    );
    if (!hold.ok) {
      log('warn', 'pedido.recusado_por_estoque', {
        ip: loggableIp(meta.ip), status: hold.status, produto: hold.productId,
        solicitado: hold.requested, disponivel: hold.available,
      });
      return { status: hold.status, body: { error: hold.error } };
    }

    if (!this.orders.save(result.order)) {
      this.inventory.removeHold(result.order.id);
      log('error', 'pedido.falha_ao_persistir', { ip: loggableIp(meta.ip) });
      return { status: 500, body: { error: PEDIDOS_PERSISTENCIA_FALHOU } };
    }

    // Número do pré-pedido é identificador de negócio, não dado pessoal: serve
    // para rastrear a origem do registro sem expor nome, telefone ou endereço.
    log('info', 'pedido.registrado', {
      ip: loggableIp(meta.ip), numero: result.order.orderNumber, itens: result.order.itemCount,
    });
    return { status: 201, body: { success: true, order: toPublicOrder(result.order) } };
  }
}

export interface LocalDataPlaneOptions {
  dataDir: string;
  production: boolean;
  reservationTtlMs: number;
  encryptionKey?: string;
  keyFilePath?: string;
  /**
   * Retenção dos pré-pedidos em dias (LGPD, art. 15, II). `0` desliga a
   * expiração automática — decisão explícita, não o padrão. Ver
   * `resolveOrderRetentionMs`.
   */
  retentionDays?: number;
  /** Tetos de pré-reserva simultânea. O chamador decide, porque no modo dividido não há origem de cliente. */
  holdLimits?: HoldLimits;
  /**
   * Chave do rastreamento de envio (64 hex). Vazia, reutiliza `encryptionKey` —
   * o token de consulta pública nunca é gravado junto do arquivo cifrado.
   */
  trackingEncryptionKey?: string;
}

/**
 * Monta o plano de dados real: estoque em memória persistido em JSON, pedidos
 * cifrados com AES-256-GCM, a varredura que devolve reservas vencidas e a
 * expiração de pré-pedidos acima da retenção (LGPD, art. 15, II).
 *
 * Só o processo que tem os arquivos chama isto. O site público nunca cria
 * `InventoryStore` nem `EncryptedOrderStore` quando está dividido — é exatamente
 * essa a propriedade que separa "o site lê o estoque" de "o site tem o estoque".
 */
export function createLocalDataPlane(options: LocalDataPlaneOptions): LocalDataPlane {
  const catalogStore = new CatalogStore(options.dataDir);
  const inventory = new InventoryStore(
    createInitialStock(),
    path.join(options.dataDir, 'inventory.json'),
    options.holdLimits,
  );
  for (const product of catalogStore.list()) {
    if (!inventory.get(product.id)) inventory.registerProduct(product.id);
  }
  const orders = new EncryptedOrderStore(
    options.dataDir,
    options.encryptionKey,
    options.production,
    options.keyFilePath,
    options.retentionDays,
  );

  if (!orders.ready) {
    // VUL-18: diagnóstico só de log. Devolver `unavailableReason` na resposta
    // seria um oráculo de configuração para qualquer visitante.
    log('warn', 'pedidos.desativado', {
      motivo: orders.unavailableReason ?? 'armazenamento indisponível',
      acao: 'a rota de pré-pedido responde 503 genérico',
    });
  }

  // LGPD, art. 15, II: a retenção é regra de tratamento, não de espaço em disco.
  // Roda na subida (pega o arquivo que cresceu enquanto o processo estava parado)
  // e depois de hora em hora. A varredura de reservas, abaixo, é de ESTOQUE; esta
  // é de DADO PESSOAL — são relógios diferentes com propósitos diferentes.
  const purgeExpiredOrders = () => {
    if (!orders.ready) return;
    const removed = orders.purgeExpired();
    if (removed > 0) {
      log('info', 'pedidos.expirados_removidos', {
        removidos: removed,
        restantes: orders.size,
        retencaoDias: orders.retentionMs / 86_400_000,
      });
    }
  };
  purgeExpiredOrders();
  const retentionSweep = setInterval(purgeExpiredOrders, 60 * 60_000);
  retentionSweep.unref();

  // Libera reservas vencidas mesmo que nenhum novo pedido chegue.
  const reservationSweep = setInterval(() => {
    const expired = inventory.sweep();
    if (expired > 0) log('info', 'estoque.reserva_expirada', { liberadas: expired });
  }, Math.min(options.reservationTtlMs, 60_000));
  reservationSweep.unref();

  // Rastreamento de envio: arquivo próprio, cifrado com AES-256-GCM. Em
  // produção sem chave declarada o store nasce indisponível (a rota de
  // consulta responde 503) — nunca gera segredo sozinho onde dado real mora.
  const tracking = new TrackingStore(
    options.dataDir,
    options.trackingEncryptionKey ?? options.encryptionKey,
    options.production,
  );

  return new LocalDataPlane(inventory, orders, tracking, catalogStore, options.reservationTtlMs);
}
