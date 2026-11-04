import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface StockItem {
  productId: string;
  total: number;
  reservado: number;
  vendido: number;
  disponivel: number;
}

export type StockAdjustment =
  | { ok: true; stock: StockItem }
  | { ok: false; status: 400 | 404 | 409 | 500; error: string };

export interface HoldLine { productId: string; quantity: number; }
interface HoldEntry { productId: string; quantity: number; expiresAt: number; owner?: string; }

/** Teto de pré-reservas simultâneas, por processo e por origem. */
export interface HoldLimits {
  /** Prevenção de esgotamento do catálogo sem custo. `0` desliga. */
  maxActiveHolds?: number;
  /**
   * Teto por origem (IP do cliente). Desligue (`0`) no modo dividido: lá a
   * origem visível é sempre a vitrine, e o teto passaria a valer por loja,
   * não por cliente.
   */
  maxHoldsPerOwner?: number;
}

export type HoldResult =
  | { ok: true }
  | { ok: false; status: 404 | 409 | 429 | 500; productId: string; requested: number; available: number; error: string };

/**
 * Persistent inventory for a single Node process. Mutations are synchronous to
 * prevent request handlers in this process from interleaving validation and write.
 * Use a transactional database when deploying multiple application instances.
 */
export class InventoryStore {
  private readonly items: Record<string, StockItem>;
  private readonly filePath?: string;
  private readonly holdsFilePath?: string;
  /** Pré-reservas persistidas separadamente; expiram por timestamp mesmo após restart. */
  private readonly holds = new Map<string, HoldEntry[]>();

  constructor(
    initial: Record<string, StockItem>,
    filePath?: string,
    private readonly limits: HoldLimits = {},
    holdsFilePath?: string,
  ) {
    this.items = Object.fromEntries(
      Object.entries(initial).map(([id, item]) => [id, { ...item }]),
    );
    this.filePath = filePath;
    this.holdsFilePath = holdsFilePath;
    // Tighten existing data directories/files too: mkdir({mode}) does not
    // change permissions when the directory already exists.
    this.securePath(this.filePath);
    this.securePath(this.holdsFilePath);
    // O estoque-base precisa ser carregado antes das reservas para validar que
    // o arquivo de holds não compromete mais unidades do que o inventário contém.
    if (this.filePath && existsSync(this.filePath)) this.loadFromDisk();
    else if (this.filePath) this.persist();
    if (this.holdsFilePath && existsSync(this.holdsFilePath)) this.loadHoldsFromDisk();
  }

  private securePath(filePath?: string): void {
    if (!filePath) return;
    const directory = dirname(filePath);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    chmodSync(directory, 0o700);
    if (existsSync(filePath)) chmodSync(filePath, 0o600);
  }

  private isValidItem(id: string, value: unknown): value is StockItem {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const item = value as Record<string, unknown>;
    for (const field of ['total', 'reservado', 'vendido', 'disponivel'] as const) {
      if (!Number.isSafeInteger(item[field]) || (item[field] as number) < 0) return false;
    }
    return item.productId === id &&
      item.total === (item.reservado as number) +
        (item.vendido as number) + (item.disponivel as number);
  }

  private loadFromDisk() {
    try {
      const raw: unknown = JSON.parse(readFileSync(this.filePath!, 'utf8'));
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error('Formato inválido no arquivo de estoque.');
      }
      for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
        // `Object.hasOwn` e não `id in this.items`: o `in` percorre a cadeia de
        // protótipo, e `Object.prototype` TEM `__proto__` e `constructor`. Com
        // o `in`, um arquivo envenenado com a chave "__proto__" passava na
        // checagem e a atribuição abaixo disparava o setter de `__proto__`,
        // trocando o protótipo do objeto de estoque em vez de gravar o item.
        if (!Object.hasOwn(this.items, id)) continue;
        if (!this.isValidItem(id, value)) {
          throw new Error('Registro inválido para o produto ' + id + '.');
        }
        this.items[id] = { ...value };
      }
    } catch (error) {
      throw new Error('Não foi possível carregar o estoque persistido: ' +
        (error instanceof Error ? error.message : 'erro desconhecido'));
    }
  }

  private persist() {
    if (!this.filePath) return;
    // O modo 0700 aqui importa mais parece: este `mkdirSync` roda ANTES do do
    // EncryptedOrderStore, então `LOLA_DATA_DIR` nasceu 0755 e o 0700 posterior
    // não corrigia um diretório já criado. O pai dos arquivos de dados não pode
    // ficar legível por outros usuários do host.
    this.securePath(this.filePath);
    const temporaryPath = this.filePath + '.' + process.pid + '.tmp';
    writeFileSync(temporaryPath, JSON.stringify(this.items, null, 2) + '\n', { mode: 0o600 });
    renameSync(temporaryPath, this.filePath);
  }

  private persistHolds(): void {
    if (!this.holdsFilePath) return;
    this.securePath(this.holdsFilePath);
    const temporaryPath = this.holdsFilePath + '.' + process.pid + '.tmp';
    const serialized = Object.fromEntries([...this.holds].map(([id, entries]) => [id, entries]));
    writeFileSync(temporaryPath, JSON.stringify(serialized) + '\n', { mode: 0o600 });
    renameSync(temporaryPath, this.holdsFilePath);
  }

  private loadHoldsFromDisk(): void {
    try {
      const raw: unknown = JSON.parse(readFileSync(this.holdsFilePath!, 'utf8'));
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Formato inválido.');
      const now = Date.now();
      const restored = new Map<string, HoldEntry[]>();
      const totals = new Map<string, number>();
      for (const [holdId, value] of Object.entries(raw as Record<string, unknown>)) {
        if (!holdId || holdId.length > 128 || !Array.isArray(value)) throw new Error('Reserva inválida.');
        const entries: HoldEntry[] = [];
        for (const candidate of value) {
          if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new Error('Linha de reserva inválida.');
          const item = candidate as Record<string, unknown>;
          if (typeof item.productId !== 'string' || !Object.hasOwn(this.items, item.productId) ||
              !Number.isSafeInteger(item.quantity) || (item.quantity as number) <= 0 ||
              !Number.isSafeInteger(item.expiresAt) || (item.expiresAt as number) <= now ||
              (item.owner !== undefined && (typeof item.owner !== 'string' || item.owner.length > 128))) {
            throw new Error('Conteúdo de reserva inválido.');
          }
          const quantity = item.quantity as number;
          const total = (totals.get(item.productId) ?? 0) + quantity;
          if (!Number.isSafeInteger(total)) throw new Error('Quantidade total de reservas inválida.');
          totals.set(item.productId, total);
          entries.push({ productId: item.productId, quantity,
            expiresAt: item.expiresAt as number, ...(typeof item.owner === 'string' ? { owner: item.owner } : {}) });
        }
        if (entries.length) restored.set(holdId, entries);
      }

      // Um arquivo de reservas truncado, adulterado ou inconsistente não pode
      // fazer o sistema aceitar estoque negativo nem bloquear unidades além do
      // saldo-base. Falhar fechado preserva a integridade até intervenção.
      for (const [productId, quantity] of totals) {
        const stock = this.lookup(productId);
        if (!stock || quantity > stock.disponivel) {
          throw new Error('Pré-reservas excedem o estoque persistido para o produto ' + productId + '.');
        }
      }
      for (const [holdId, entries] of restored) this.holds.set(holdId, entries);
      this.persistHolds();
    } catch (error) {
      throw new Error('Não foi possível carregar as pré-reservas persistidas: ' +
        (error instanceof Error ? error.message : 'erro desconhecido'));
    }
  }

  /** Unidades já comprometidas por pré-reservas ativas. */
  heldQuantity(productId: string, now = Date.now()): number {
    let total = 0;
    for (const entries of this.holds.values()) {
      for (const entry of entries) {
        if (entry.productId === productId && entry.expiresAt > now) total += entry.quantity;
      }
    }
    return total;
  }

  /**
   * Lê um item por id sem atravessar a cadeia de protótipo.
   *
   * `this.items[productId]` devolve `Object.prototype.constructor` para o id
   * "constructor" e o próprio protótipo para "__proto__": são chaves herdadas,
   * não registradas. Um id digitado na URL, sem esta guarda, virava um item de
   * estoque fantasma com saldo `NaN` no lugar de "produto não encontrado" — e
   * no caminho de baixa chegaria a escrever propriedade em `Object`.
   */
  private lookup(productId: string): StockItem | undefined {
    if (!Object.hasOwn(this.items, productId)) return undefined;
    return this.items[productId];
  }

  /** Unidades realmente vendáveis: estoque gravado menos as pré-reservas ativas. */
  availableQuantity(productId: string, now = Date.now()): number {
    const item = this.lookup(productId);
    if (!item) return 0;
    return Math.max(0, item.disponivel - this.heldQuantity(productId, now));
  }

  /** Estoque contábil com `disponivel` já líquido das pré-reservas ativas. */
  get(productId: string): StockItem | undefined {
    const item = this.lookup(productId);
    return item ? { ...item, disponivel: this.availableQuantity(productId) } : undefined;
  }

  list(): StockItem[] {
    return Object.keys(this.items).map((id) => this.get(id)!).filter(Boolean);
  }

  /**
   * Registra uma pré-reserva depois de validar TODAS as linhas de uma vez.
   *
   * VUL-03: antes disto, buildOrderDraft apenas conferia `disponivel` e seguia.
   * Doze pedidos de 5 unidades passavam todos contra 7 em estoque porque nada
   * era comprometido entre a validação e a gravação. Como o handler de pedido é
   * totalmente síncrono, validar tudo e gravar em seguida é atômico.
   */
  /**
   * Pré-reservas vivas, contando hold (e não linha) — um pedido de três
   * produtos é UMA reserva, não três.
   */
  private countActiveHolds(now: number, owner?: string): number {
    let total = 0;
    for (const entries of this.holds.values()) {
      const live = entries.filter((entry) =>
        entry.expiresAt > now && (owner === undefined || entry.owner === owner));
      if (live.length > 0) total += 1;
    }
    return total;
  }

  placeHold(
    holdId: string,
    lines: HoldLine[],
    expiresAt: number,
    now = Date.now(),
    owner?: string,
  ): HoldResult {
    this.sweep(now);

    // VUL-C: sem teto, um IP anônimo segurava o catálogo inteiro em pré-reserva
    // por 30 min e renovava continuamente — de graça, sem e-mail, sem pagamento,
    // sem captcha. A loja aparecia esgotada para clientes reais.
    const requested = lines.reduce((sum, line) => sum + (line.quantity || 0), 0);
    const rejected = (productId: string, error: string): HoldResult => ({
      ok: false, status: 429, productId, requested, available: 0, error,
    });

    const maxPerOwner = this.limits.maxHoldsPerOwner ?? 0;
    if (maxPerOwner > 0 && owner && this.countActiveHolds(now, owner) >= maxPerOwner) {
      return rejected(lines[0]?.productId ?? '',
        'Este cliente já tem muitas pré-reservas ativas. Aguarde alguns minutos ou finalize o pedido em aberto.');
    }

    const maxActive = this.limits.maxActiveHolds ?? 0;
    if (maxActive > 0 && this.countActiveHolds(now) >= maxActive) {
      return rejected(lines[0]?.productId ?? '',
        'O sistema está com muitas pré-reservas ativas no momento. Tente novamente em instantes.');
    }

    // Acumula por produto durante a validação: sem isso, três linhas de 3
    // unidades passariam separadamente contra 7 em estoque (total 9).
    const pending = new Map<string, number>();
    for (const line of lines) {
      if (!this.lookup(line.productId)) {
        return {
          ok: false, status: 404, productId: line.productId,
          requested: line.quantity, available: 0,
          error: 'O estoque deste produto ainda não foi configurado.',
        };
      }
      const available = this.availableQuantity(line.productId, now) - (pending.get(line.productId) ?? 0);
      if (available < line.quantity) {
        return {
          ok: false, status: 409, productId: line.productId,
          requested: line.quantity, available: Math.max(0, available),
          error: 'O estoque acabou durante o registro. Atualize a sacola e tente novamente.',
        };
      }
      pending.set(line.productId, (pending.get(line.productId) ?? 0) + line.quantity);
    }
    const previous = this.holds.get(holdId);
    this.holds.set(holdId, lines.map((line) => ({ ...line, expiresAt, ...(owner ? { owner } : {}) })));
    try { this.persistHolds(); }
    catch {
      if (previous) this.holds.set(holdId, previous); else this.holds.delete(holdId);
      return { ok: false, status: 500, productId: lines[0]?.productId ?? '', requested, available: 0,
        error: 'Não foi possível registrar a reserva com segurança. Tente novamente.' };
    }
    return { ok: true };
  }

  removeHold(holdId: string): boolean {
    const previous = this.holds.get(holdId);
    if (!previous) return false;
    this.holds.delete(holdId);
    try { this.persistHolds(); return true; }
    catch { this.holds.set(holdId, previous); return false; }
  }

  /** Devolve ao estoque as pré-reservas vencidas. */
  sweep(now = Date.now()): number {
    const before = this.snapshotHolds();
    let expired = 0;
    for (const [holdId, entries] of [...this.holds]) {
      const live = entries.filter((entry) => entry.expiresAt > now);
      if (live.length === entries.length) continue;
      expired += entries.length - live.length;
      if (live.length) this.holds.set(holdId, live);
      else this.holds.delete(holdId);
    }
    if (expired > 0) {
      try { this.persistHolds(); }
      catch { this.restoreHolds(before); return 0; }
    }
    return expired;
  }

  private snapshotHolds(): Map<string, HoldEntry[]> {
    return new Map([...this.holds].map(([holdId, entries]) => [holdId, entries.map((e) => ({ ...e }))]));
  }

  private restoreHolds(snapshot: Map<string, HoldEntry[]>) {
    this.holds.clear();
    for (const [holdId, entries] of snapshot) this.holds.set(holdId, entries);
  }

  /**
   * Uma baixa consome primeiro as unidades pré-reservadas (alocação FIFO) e só
   * depois as livres. Sem isso, o atendente não conseguiria registrar a venda de
   * um pedido em pré-reserva — `disponivel` já estaria descontado.
   */
  private releaseHolds(productId: string, quantity: number, now = Date.now()) {
    let remaining = quantity;
    for (const [holdId, entries] of [...this.holds]) {
      if (remaining <= 0) break;
      for (let index = 0; index < entries.length && remaining > 0;) {
        const entry = entries[index];
        if (entry.productId !== productId || entry.expiresAt <= now) {
          index += 1;
          continue;
        }
        const taken = Math.min(entry.quantity, remaining);
        entry.quantity -= taken;
        remaining -= taken;
        if (entry.quantity === 0) entries.splice(index, 1);
      }
      if (entries.length === 0) this.holds.delete(holdId);
    }
  }

  deduct(productId: unknown, quantity: unknown): StockAdjustment {
    if (typeof productId !== 'string' || !productId.trim()) {
      return { ok: false, status: 400, error: 'productId é obrigatório.' };
    }
    if (typeof quantity !== 'number' || !Number.isSafeInteger(quantity) || quantity <= 0) {
      return { ok: false, status: 400, error: 'quantidade deve ser um inteiro positivo.' };
    }
    const current = this.lookup(productId);
    if (!current) {
      return { ok: false, status: 404, error: 'Produto não encontrado no catálogo.' };
    }

    const holdsBefore = this.snapshotHolds();
    this.releaseHolds(productId, quantity);
    if (quantity > current.disponivel) {
      this.restoreHolds(holdsBefore);
      return { ok: false, status: 409, error: 'Estoque insuficiente para esta quantidade.' };
    }

    const previous = { ...current };
    current.disponivel -= quantity;
    current.vendido += quantity;
    try {
      this.persistHolds();
      this.persist();
    } catch {
      this.items[productId] = previous;
      this.restoreHolds(holdsBefore);
      try { this.persistHolds(); } catch { /* keep process fail-closed; operator must inspect storage */ }
      return { ok: false, status: 500, error: 'Não foi possível salvar a atualização de estoque.' };
    }
    return { ok: true, stock: { ...current, disponivel: this.availableQuantity(productId) } };
  }
}
