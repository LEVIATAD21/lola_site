import { afterEach, describe, expect, it } from 'vitest';
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InventoryStore, type StockItem } from '../inventory';

const initial: Record<string, StockItem> = {
  'brinco-1': { productId: 'brinco-1', total: 10, reservado: 1, vendido: 2, disponivel: 7 },
};
const tempDirs: string[] = [];

function makeStore() {
  return new InventoryStore(initial);
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('InventoryStore', () => {
  it('retorna cópia dos dados e não permite mutação externa', () => {
    const store = makeStore();
    const stock = store.get('brinco-1');
    if (stock) stock.disponivel = 999;
    expect(store.get('brinco-1')?.disponivel).toBe(7);
  });

  it('não inventa estoque para produto desconhecido', () => {
    const store = makeStore();
    expect(store.get('nao-existe')).toBeUndefined();
    expect(store.deduct('nao-existe', 1)).toMatchObject({ ok: false, status: 404 });
  });

  it('rejeita quantidade ausente, zero, negativa, fracionada ou não numérica', () => {
    const store = makeStore();
    for (const quantity of [undefined, null, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '2']) {
      expect(store.deduct('brinco-1', quantity).ok).toBe(false);
    }
    expect(store.get('brinco-1')?.disponivel).toBe(7);
  });

  it('faz baixa consistente no estoque', () => {
    const store = makeStore();
    expect(store.deduct('brinco-1', 3)).toMatchObject({ ok: true });
    expect(store.get('brinco-1')).toEqual({
      productId: 'brinco-1', total: 10, reservado: 1, vendido: 5, disponivel: 4,
    });
  });

  it('recusa quantidade acima da disponibilidade sem alterar o estoque', () => {
    const store = makeStore();
    expect(store.deduct('brinco-1', 8)).toMatchObject({ ok: false, status: 409 });
    expect(store.get('brinco-1')?.disponivel).toBe(7);
    expect(store.get('brinco-1')?.vendido).toBe(2);
  });

  it('persiste baixas e recupera os dados depois de recriar a instância', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lola-inventory-'));
    tempDirs.push(dir);
    const file = join(dir, 'inventory.json');
    const store = new InventoryStore(initial, file);
    expect(store.deduct('brinco-1', 2).ok).toBe(true);
    expect(JSON.parse(readFileSync(file, 'utf8'))['brinco-1'].disponivel).toBe(5);
    const restarted = new InventoryStore(initial, file);
    expect(restarted.get('brinco-1')).toMatchObject({ vendido: 4, disponivel: 5 });
  });

  it('cria o arquivo inicial com permissões restritas', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lola-inventory-seed-'));
    tempDirs.push(dir);
    const file = join(dir, 'inventory.json');
    new InventoryStore(initial, file);
    expect(JSON.parse(readFileSync(file, 'utf8'))['brinco-1'].disponivel).toBe(7);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it('corrige permissões inseguras em diretório e arquivo já existentes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lola-inventory-perms-'));
    tempDirs.push(dir);
    const file = join(dir, 'inventory.json');
    writeFileSync(file, JSON.stringify(initial), { mode: 0o644 });
    // Simula volume antigo criado com permissões permissivas.
    chmodSync(dir, 0o755);
    chmodSync(file, 0o644);
    new InventoryStore(initial, file);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it('falha de forma segura se os dados persistidos estiverem inconsistentes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lola-inventory-corrupt-'));
    tempDirs.push(dir);
    const file = join(dir, 'inventory.json');
    const store = new InventoryStore(initial, file);
    store.deduct('brinco-1', 1);
    const data = JSON.parse(readFileSync(file, 'utf8'));
    data['brinco-1'].disponivel = -100;
    writeFileSync(file, JSON.stringify(data));
    expect(() => new InventoryStore(initial, file)).toThrow(/estoque persistido/);
  });

  it('ignora chave de protótipo vinda do arquivo e não troca o protótipo do estoque', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lola-inventory-proto-'));
    tempDirs.push(dir);
    const file = join(dir, 'inventory.json');
    const store = new InventoryStore(initial, file);
    store.deduct('brinco-1', 1);

    // `JSON.parse` cria "__proto__" como propriedade própria. Com o `in`, a
    // checagem era true (Object.prototype TEM essa chave) e a atribuição
    // disparava o setter: o protótipo do objeto de estoque era trocado e
    // QUALQUER id desconhecido passava a devolver um item inventado pelo
    // arquivo, com saldo à escolha do atacante.
    const hostil = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    Object.defineProperty(hostil, '__proto__', {
      value: { productId: 'fantasma', total: 999_999, reservado: 0, vendido: 0, disponivel: 999_999 },
      enumerable: true, writable: true, configurable: true,
    });
    hostil['constructor'] = {
      productId: 'constructor', total: 0, reservado: 0, vendido: 0, disponivel: 0,
    };
    writeFileSync(file, JSON.stringify(hostil));

    const restarted = new InventoryStore(initial, file);

    expect(restarted.get('brinco-1')).toMatchObject({ vendido: 3, disponivel: 6 });
    // O impacto: sem a correção, um id que não existe devolvia um item com
    // saldo forjado pelo arquivo, em vez de undefined.
    expect(restarted.get('produto-fantasma')).toBeUndefined();
    expect(restarted.get('constructor')).toBeUndefined();
  });
});

// VUL-03: 12 pré-pedidos de 5 unidades passavam todos contra 7 em estoque,
// porque cada validação voltava a enxergar o mesmo saldo.
describe('InventoryStore — pré-reservas', () => {
  const soon = Date.now() + 60_000;

  it('compromete o estoque e recusa pedido acima do saldo líquido', () => {
    const store = makeStore();
    expect(store.get('brinco-1')?.disponivel).toBe(7);

    expect(store.placeHold('pedido-1', [{ productId: 'brinco-1', quantity: 5 }], soon)).toEqual({ ok: true });
    expect(store.get('brinco-1')?.disponivel).toBe(2);

    const second = store.placeHold('pedido-2', [{ productId: 'brinco-1', quantity: 5 }], soon);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.status).toBe(409);
      expect(second.requested).toBe(5);
      expect(second.available).toBe(2);
    }
    expect(store.get('brinco-1')?.disponivel).toBe(2);
  });

  it('é atômico por pedido: uma linha acima do saldo não reserva nada das demais', () => {
    const store = makeStore();
    const result = store.placeHold('pedido-1', [
      { productId: 'brinco-1', quantity: 3 },
      { productId: 'brinco-1', quantity: 5 },
    ], soon);
    expect(result.ok).toBe(false);
    expect(store.heldQuantity('brinco-1')).toBe(0);
    expect(store.get('brinco-1')?.disponivel).toBe(7);
  });

  it('acumula linhas repetidas do mesmo produto antes de validar', () => {
    const store = makeStore();
    expect(
      store.placeHold('pedido-1', [
        { productId: 'brinco-1', quantity: 3 },
        { productId: 'brinco-1', quantity: 3 },
        { productId: 'brinco-1', quantity: 3 },
      ], soon).ok,
    ).toBe(false);
    expect(store.get('brinco-1')?.disponivel).toBe(7);
  });

  it('devolve o estoque quando a reserva expira', () => {
    const store = makeStore();
    const now = Date.now();
    expect(store.placeHold('pedido-1', [{ productId: 'brinco-1', quantity: 7 }], now + 1_000, now)).toEqual({ ok: true });
    expect(store.get('brinco-1')?.disponivel).toBe(0);

    expect(store.sweep(now + 500)).toBe(0);
    expect(store.get('brinco-1')?.disponivel).toBe(0);

    expect(store.sweep(now + 2_000)).toBe(1);
    expect(store.heldQuantity('brinco-1')).toBe(0);
    expect(store.get('brinco-1')?.disponivel).toBe(7);
  });

  it('libera a reserva ao descartar o pré-pedido', () => {
    const store = makeStore();
    expect(store.placeHold('pedido-1', [{ productId: 'brinco-1', quantity: 4 }], soon)).toEqual({ ok: true });
    expect(store.get('brinco-1')?.disponivel).toBe(3);
    expect(store.removeHold('pedido-1')).toBe(true);
    expect(store.get('brinco-1')?.disponivel).toBe(7);
    expect(store.removeHold('pedido-inexistente')).toBe(false);
  });

  it('a baixa consome primeiro as unidades pré-reservadas', () => {
    const store = makeStore();
    expect(store.placeHold('pedido-1', [{ productId: 'brinco-1', quantity: 5 }], soon)).toEqual({ ok: true });
    // 3 unidades saem da reserva; as 2 livres continuam intocadas.
    expect(store.deduct('brinco-1', 3)).toMatchObject({ ok: true });
    expect(store.get('brinco-1')).toMatchObject({ vendido: 5, disponivel: 2 });
    expect(store.heldQuantity('brinco-1')).toBe(2);
  });

  it('recusa baixa acima do saldo e restaura a reserva intacta', () => {
    const store = makeStore();
    expect(store.placeHold('pedido-1', [{ productId: 'brinco-1', quantity: 5 }], soon)).toEqual({ ok: true });
    expect(store.deduct('brinco-1', 10)).toMatchObject({ ok: false, status: 409 });
    expect(store.heldQuantity('brinco-1')).toBe(5);
    expect(store.get('brinco-1')).toMatchObject({ vendido: 2, disponivel: 2 });
  });

  it('persiste pré-reservas em arquivo separado e recupera após reinicialização', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lola-inventory-hold-'));
    tempDirs.push(dir);
    const file = join(dir, 'inventory.json');
    const holds = join(dir, 'inventory-holds.json');
    const store = new InventoryStore(initial, file, {}, holds);
    expect(store.placeHold('pedido-1', [{ productId: 'brinco-1', quantity: 6 }], soon)).toEqual({ ok: true });
    expect(JSON.parse(readFileSync(file, 'utf8'))['brinco-1'].disponivel).toBe(7);
    expect(JSON.parse(readFileSync(holds, 'utf8'))['pedido-1'][0]).toMatchObject({ productId: 'brinco-1', quantity: 6 });
    // O diretório e os dois arquivos contêm estado operacional privado.
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(statSync(holds).mode & 0o777).toBe(0o600);
    // Reiniciar recupera o bloqueio, evitando overselling durante o TTL.
    const restarted = new InventoryStore(initial, file, {}, holds);
    expect(restarted.get('brinco-1')?.disponivel).toBe(1);
    expect(restarted.removeHold('pedido-1')).toBe(true);
    expect(restarted.get('brinco-1')?.disponivel).toBe(7);
  });

  it('descarta pré-reservas expiradas durante a recuperação após reinicialização', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lola-inventory-expired-'));
    tempDirs.push(dir);
    const file = join(dir, 'inventory.json');
    const holds = join(dir, 'inventory-holds.json');
    new InventoryStore(initial, file, {}, holds);
    writeFileSync(holds, JSON.stringify({
      'pedido-expirado': [{ productId: 'brinco-1', quantity: 6, expiresAt: Date.now() - 1_000 }],
    }));

    const restarted = new InventoryStore(initial, file, {}, holds);

    expect(restarted.get('brinco-1')?.disponivel).toBe(7);
    expect(JSON.parse(readFileSync(holds, 'utf8'))).toEqual({});
  });

  it('falha fechado quando reservas persistidas excedem o estoque-base', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lola-inventory-overheld-'));
    tempDirs.push(dir);
    const file = join(dir, 'inventory.json');
    const holds = join(dir, 'inventory-holds.json');
    new InventoryStore(initial, file, {}, holds);
    writeFileSync(holds, JSON.stringify({
      'pedido-inconsistente': [{ productId: 'brinco-1', quantity: 8, expiresAt: Date.now() + 60_000 }],
    }));

    expect(() => new InventoryStore(initial, file, {}, holds))
      .toThrow(/Pré-reservas excedem o estoque persistido/);
  });

  it('não reserva estoque de produto sem registro', () => {
    const store = makeStore();
    const result = store.placeHold('pedido-1', [{ productId: 'nao-existe', quantity: 1 }], soon);
    expect(result).toMatchObject({ ok: false, status: 404 });
  });
});

describe('InventoryStore — tetos de pré-reserva (VUL-C)', () => {
  const now = Date.now();
  const soon = now + 60_000;
  const line = { productId: 'brinco-1', quantity: 1 };
  const wideStock: Record<string, StockItem> = {
    'brinco-1': { productId: 'brinco-1', total: 10_000, reservado: 0, vendido: 0, disponivel: 10_000 },
  };

  it('recusa com 429 quando a origem atinge o teto de reservas simultâneas', () => {
    const store = new InventoryStore(wideStock, undefined, { maxHoldsPerOwner: 3 });

    expect(store.placeHold('p-1', [line], soon, now, '203.0.113.9').ok).toBe(true);
    expect(store.placeHold('p-2', [line], soon, now, '203.0.113.9').ok).toBe(true);
    expect(store.placeHold('p-3', [line], soon, now, '203.0.113.9').ok).toBe(true);

    const rejected = store.placeHold('p-4', [line], soon, now, '203.0.113.9');
    expect(rejected).toMatchObject({ ok: false, status: 429 });
    // Outra origem continua livre: o teto é por cliente, não global.
    expect(store.placeHold('p-5', [line], soon, now, '198.51.100.4').ok).toBe(true);
  });

  it('devolve a vaga quando a reserva vence, para o mesmo cliente não ficar preso', () => {
    const store = new InventoryStore(wideStock, undefined, { maxHoldsPerOwner: 1 });

    expect(store.placeHold('p-1', [line], soon, now, '203.0.113.9').ok).toBe(true);
    expect(store.placeHold('p-2', [line], soon, now, '203.0.113.9')).toMatchObject({ status: 429 });

    // Depois do vencimento, a vaga volta sem precisar de novo pedido.
    expect(store.placeHold('p-3', [line], soon, soon + 1, '203.0.113.9').ok).toBe(true);
  });

  it('conta UMA reserva por pedido, não uma por linha do pedido', () => {
    const store = new InventoryStore(wideStock, undefined, { maxHoldsPerOwner: 1 });

    const multi = store.placeHold('p-1', [line, line, line], soon, now, '203.0.113.9');
    expect(multi.ok).toBe(true);
    expect(store.placeHold('p-2', [line], soon, now, '203.0.113.9')).toMatchObject({ status: 429 });
  });

  it('aplica teto global de reservas ativas, independente da origem', () => {
    const store = new InventoryStore(wideStock, undefined, { maxActiveHolds: 2 });

    expect(store.placeHold('p-1', [line], soon, now, '203.0.113.9').ok).toBe(true);
    expect(store.placeHold('p-2', [line], soon, now, '198.51.100.4').ok).toBe(true);
    expect(store.placeHold('p-3', [line], soon, now, '203.0.113.9')).toMatchObject({ status: 429 });
  });

  it('fica sem teto quando o chamador não informa origem (modo dividido)', () => {
    const store = new InventoryStore(wideStock, undefined, { maxHoldsPerOwner: 1 });

    expect(store.placeHold('p-1', [line], soon, now).ok).toBe(true);
    expect(store.placeHold('p-2', [line], soon, now).ok).toBe(true);
  });

  it('0 desliga os tetos', () => {
    const store = new InventoryStore(wideStock, undefined, { maxActiveHolds: 0, maxHoldsPerOwner: 0 });
    for (let index = 0; index < 20; index += 1) {
      expect(store.placeHold('p-' + index, [line], soon, now, '203.0.113.9').ok).toBe(true);
    }
  });

  it('cria o diretório de dados sem permissão de leitura para outros usuários', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lola-inventory-mode-'));
    tempDirs.push(dir);
    const file = join(dir, 'sub', 'inventory.json');

    // A primeira gravação cria o diretório; antes o mkdirSync ia sem modo e o
    // `.data` nascia 0755.
    new InventoryStore(initial, file);

    const { statSync } = require('node:fs') as typeof import('node:fs');
    expect(statSync(join(dir, 'sub')).mode & 0o077).toBe(0);
  });
});
