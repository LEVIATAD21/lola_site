import path from 'node:path';
import { InventoryStore, type HoldLimits } from './inventory';
import { CATALOG_INFO } from './catalog';
import { buildOrderDraft, EncryptedOrderStore, toPublicOrder } from './orders';
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
  private readonly reservationTtlMs: number;

  constructor(inventory: InventoryStore, orders: EncryptedOrderStore, reservationTtlMs: number) {
    this.inventory = inventory;
    this.orders = orders;
    this.reservationTtlMs = reservationTtlMs;
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
      body, CATALOG_INFO, this.inventory, undefined,
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
  /** Tetos de pré-reserva simultânea. O chamador decide, porque no modo dividido não há origem de cliente. */
  holdLimits?: HoldLimits;
}

/**
 * Monta o plano de dados real: estoque em memória persistido em JSON, pedidos
 * cifrados com AES-256-GCM e a varredura que devolve reservas vencidas.
 *
 * Só o processo que tem os arquivos chama isto. O site público nunca cria
 * `InventoryStore` nem `EncryptedOrderStore` quando está dividido — é exatamente
 * essa a propriedade que separa "o site lê o estoque" de "o site tem o estoque".
 */
export function createLocalDataPlane(options: LocalDataPlaneOptions): LocalDataPlane {
  const inventory = new InventoryStore(
    createInitialStock(),
    path.join(options.dataDir, 'inventory.json'),
    options.holdLimits,
  );
  const orders = new EncryptedOrderStore(
    options.dataDir,
    options.encryptionKey,
    options.production,
    options.keyFilePath,
  );

  if (!orders.ready) {
    // VUL-18: diagnóstico só de log. Devolver `unavailableReason` na resposta
    // seria um oráculo de configuração para qualquer visitante.
    log('warn', 'pedidos.desativado', {
      motivo: orders.unavailableReason ?? 'armazenamento indisponível',
      acao: 'a rota de pré-pedido responde 503 genérico',
    });
  }

  // Libera reservas vencidas mesmo que nenhum novo pedido chegue.
  const reservationSweep = setInterval(() => {
    const expired = inventory.sweep();
    if (expired > 0) log('info', 'estoque.reserva_expirada', { liberadas: expired });
  }, Math.min(options.reservationTtlMs, 60_000));
  reservationSweep.unref();

  return new LocalDataPlane(inventory, orders, options.reservationTtlMs);
}
