import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

  it('cria o arquivo inicial de estoque quando o armazenamento ainda não existe', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lola-inventory-seed-'));
    tempDirs.push(dir);
    const file = join(dir, 'inventory.json');
    new InventoryStore(initial, file);
    expect(JSON.parse(readFileSync(file, 'utf8'))['brinco-1'].disponivel).toBe(7);
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

  it('não grava reserva no arquivo de estoque', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lola-inventory-hold-'));
    tempDirs.push(dir);
    const file = join(dir, 'inventory.json');
    const store = new InventoryStore(initial, file);
    expect(store.placeHold('pedido-1', [{ productId: 'brinco-1', quantity: 6 }], soon)).toEqual({ ok: true });
    expect(JSON.parse(readFileSync(file, 'utf8'))['brinco-1'].disponivel).toBe(7);
    // Reiniciar o processo libera reservas: nada de estoque travado sem registro.
    const restarted = new InventoryStore(initial, file);
    expect(restarted.get('brinco-1')?.disponivel).toBe(7);
  });

  it('não reserva estoque de produto sem registro', () => {
    const store = makeStore();
    const result = store.placeHold('pedido-1', [{ productId: 'nao-existe', quantity: 1 }], soon);
    expect(result).toMatchObject({ ok: false, status: 404 });
  });
});
