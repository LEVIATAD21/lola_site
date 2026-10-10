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
