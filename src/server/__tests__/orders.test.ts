import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildOrderDraft, EncryptedOrderStore, type StoredOrderDraft, type OrderCatalogProduct } from '../orders';
import { InventoryStore, type StockItem } from '../inventory';

const catalog: OrderCatalogProduct[] = [
  { id: 'brinco-1', name: 'Brinco Argola Lisa', category: 'Brincos', price: 49.9 },
  { id: 'prod-colar-1', name: 'Colar Coração Madreperola', category: 'Colares', price: 59.9 },
];
const stock: Record<string, StockItem> = {
  'brinco-1': { productId: 'brinco-1', total: 10, reservado: 0, vendido: 2, disponivel: 8 },
  'prod-colar-1': { productId: 'prod-colar-1', total: 5, reservado: 0, vendido: 5, disponivel: 0 },
};
const tempDirs: string[] = [];
function validInput(overrides: Record<string, unknown> = {}) {
  return {
    customer: {
      fullName: 'Maria da Silva', phone: '(21) 98765-4321', cep: '26300-000',
      street: 'Rua das Flores', number: '123', complement: 'Casa 2', neighborhood: 'Centro',
      city: 'Queimados', state: 'RJ',
    },
    items: [{ productId: 'brinco-1', quantity: 2 }],
    paymentMethod: 'pix', couponCode: 'lola10', shippingOptionId: 'pac',
    giftWrap: true, termsAccepted: true, ...overrides,
  };
}
function inventory() { return new InventoryStore(stock); }
function tempDirectory() {
  const dir = mkdtempSync(join(tmpdir(), 'lola-orders-test-'));
  tempDirs.push(dir);
  return dir;
}
function builtOrder(): StoredOrderDraft {
  const result = buildOrderDraft(validInput(), catalog, inventory());
  if (!result.ok) throw new Error(result.error);
  return result.order;
}
afterEach(() => { for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe('buildOrderDraft', () => {
  it('calcula preço do servidor, desconto, frete e embalagem em centavos', () => {
    const result = buildOrderDraft(validInput({ items: [{ productId: 'brinco-1', quantity: 2, price: 0 }] }), catalog, inventory(), new Date('2026-10-10T12:00:00.000Z'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.order.subtotalCents).toBe(9980);
    expect(result.order.discountCents).toBe(998);
    expect(result.order.shippingCents).toBe(1990);
    expect(result.order.giftWrapCents).toBe(990);
    expect(result.order.totalCents).toBe(11962);
    expect(result.order.paymentStatus).toBe('not_configured');
  });
  it('gera um identificador e não sinaliza pagamento aprovado', () => {
    const result = buildOrderDraft(validInput(), catalog, inventory());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.order.orderNumber).toMatch(/^LOLA-\d{8}-[A-F0-9]{12}$/);
    expect(result.order.status).toBe('awaiting_payment_setup');
    expect(result.order.paymentStatus).toBe('not_configured');
  });
  it('recusa body vazio, sacola vazia e termos não aceitos', () => {
    expect(buildOrderDraft(null, catalog, inventory()).ok).toBe(false);
    expect(buildOrderDraft(validInput({ items: [] }), catalog, inventory()).ok).toBe(false);
    expect(buildOrderDraft(validInput({ termsAccepted: false }), catalog, inventory()).ok).toBe(false);
  });
  it('valida nome, telefone, CEP e UF', () => {
    expect(buildOrderDraft(validInput({ customer: { ...validInput().customer, fullName: 'A' } }), catalog, inventory()).ok).toBe(false);
    expect(buildOrderDraft(validInput({ customer: { ...validInput().customer, phone: '123' } }), catalog, inventory()).ok).toBe(false);
    expect(buildOrderDraft(validInput({ customer: { ...validInput().customer, cep: '1234' } }), catalog, inventory()).ok).toBe(false);
    expect(buildOrderDraft(validInput({ customer: { ...validInput().customer, number: '' } }), catalog, inventory()).ok).toBe(false);
    expect(buildOrderDraft(validInput({ customer: { ...validInput().customer, state: 'XX' } }), catalog, inventory()).ok).toBe(false);
  });
  it('rejeita produto desconhecido, produto sem estoque e quantidade fracionada', () => {
    expect(buildOrderDraft(validInput({ items: [{ productId: 'nao-existe', quantity: 1 }] }), catalog, inventory()).ok).toBe(false);
    expect(buildOrderDraft(validInput({ items: [{ productId: 'prod-colar-1', quantity: 1 }] }), catalog, inventory())).toMatchObject({ ok: false, status: 409 });
    expect(buildOrderDraft(validInput({ items: [{ productId: 'brinco-1', quantity: 1.5 }] }), catalog, inventory()).ok).toBe(false);
  });
  it('recusa excesso de estoque sem alterá-lo', () => {
    const store = inventory();
    expect(buildOrderDraft(validInput({ items: [{ productId: 'brinco-1', quantity: 9 }] }), catalog, store)).toMatchObject({ ok: false, status: 409 });
    expect(store.get('brinco-1')?.disponivel).toBe(8);
  });
  it('rejeita cupom, frete e forma de pagamento inválidos', () => {
    expect(buildOrderDraft(validInput({ couponCode: 'FAKE100' }), catalog, inventory()).ok).toBe(false);
    expect(buildOrderDraft(validInput({ shippingOptionId: 'instantaneo' }), catalog, inventory()).ok).toBe(false);
    expect(buildOrderDraft(validInput({ paymentMethod: 'wire_transfer' }), catalog, inventory()).ok).toBe(false);
    expect(buildOrderDraft(validInput({ paymentMethod: 'credit_card' }), catalog, inventory())).toMatchObject({ ok: false, status: 400, error: expect.stringContaining('Pagamento por cartão indisponível') });
  });
  it('agrega linhas repetidas do mesmo produto na validação de estoque', () => {
    expect(buildOrderDraft(validInput({ items: [{ productId: 'brinco-1', quantity: 5 }, { productId: 'brinco-1', quantity: 4 }] }), catalog, inventory())).toMatchObject({ ok: false, status: 409 });
  });
  it('não persiste campos de cartão mesmo se forem recebidos no body', () => {
    const result = buildOrderDraft({ ...validInput(), cardNumber: '4111111111111111', cardCvv: '123', cardExpiry: '12/30' }, catalog, inventory());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(JSON.stringify(result.order)).not.toContain('4111111111111111');
    expect(JSON.stringify(result.order)).not.toContain('cardCvv');
    expect(JSON.stringify(result.order)).not.toContain('cardExpiry');
  });

  // VUL-09: XSS armazenado latente — o nome do cliente é persistido e reexibido
  // ao administrador. A rejeição acontece na entrada, em todos os campos de texto.
  it('rejeita marcação HTML em qualquer campo de texto do cliente', () => {
    const base = validInput().customer as Record<string, string>;
    const attacks: Array<Record<string, string>> = [
      { fullName: '<img src=x onerror=alert(1)>' },
      { street: 'Rua das Flores <script>alert(document.cookie)</script>' },
      { number: '123<b>' },
      { neighborhood: 'Centro<svg onload=alert(1)>' },
      { city: 'Queimados"><iframe>' },
      { complement: '"><svg onload=alert(1)>' },
      { state: 'RJ<' },
    ];
    for (const override of attacks) {
      const result = buildOrderDraft(validInput({ customer: { ...base, ...override } }), catalog, inventory());
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(400);
        expect(result.error).toMatch(/marcação/);
      }
    }
  });

  it('rejeita marcação HTML na variação de produto', () => {
    const result = buildOrderDraft(
      validInput({ items: [{ productId: 'brinco-1', quantity: 1, variant: '<script>alert(1)</script>' }] }),
      catalog, inventory(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });
});

describe('EncryptedOrderStore', () => {
  it('cifra dados pessoais e recupera solicitação após reinicialização', () => {
    const dir = tempDirectory();
    const first = new EncryptedOrderStore(dir);
    expect(first.ready).toBe(true);
    const order = builtOrder();
    expect(first.save(order)).toBe(true);
    const raw = readFileSync(join(dir, 'orders.enc.json'), 'utf8');
    expect(raw).not.toContain('Maria da Silva');
    expect(raw).not.toContain('26300-000');
    expect(raw).not.toContain('Rua das Flores');
    const restarted = new EncryptedOrderStore(dir);
    expect(restarted.ready).toBe(true);
    expect(restarted.hasOrder(order.orderNumber)).toBe(true);
    expect(restarted.size).toBe(1);
  });
  it('lista pré-pedidos recentes sem expor referências mutáveis internas', () => {
    const store = new EncryptedOrderStore(tempDirectory());
    const first = builtOrder();
    const second = builtOrder();
    expect(store.save(first)).toBe(true);
    expect(store.save(second)).toBe(true);
    const latest = store.listRecent(1);
    expect(latest).toHaveLength(1);
    expect(latest[0].orderNumber).toBe(second.orderNumber);
    latest[0].customer.fullName = 'Nome alterado externamente';
    expect(store.findByOrderNumber(second.orderNumber)?.customer.fullName).toBe('Maria da Silva');
  });

  it('exige chave do ambiente em produção e não salva sem ela', () => {
    const store = new EncryptedOrderStore(tempDirectory(), undefined, true);
    expect(store.ready).toBe(false);
    expect(store.save(builtOrder())).toBe(false);
    expect(store.unavailableReason).toMatch(/LOLA_ORDERS_ENCRYPTION_KEY/);
  });
  it('aceita chave de 32 bytes em hexadecimal', () => {
    const store = new EncryptedOrderStore(tempDirectory(), 'ab'.repeat(32), true);
    expect(store.ready).toBe(true);
    expect(store.save(builtOrder())).toBe(true);
  });

  // VUL-05: a exceção saía do construtor, o processo morria e o PM2/systemd reiniciava
  // indefinidamente (boot loop) a partir do momento em que a chave mudava.
  it('não derruba o processo quando a chave não decifra o arquivo', () => {
    const dir = tempDirectory();
    const store = new EncryptedOrderStore(dir, 'ab'.repeat(32), true);
    expect(store.ready).toBe(true);
    expect(store.save(builtOrder())).toBe(true);
    const original = readFileSync(join(dir, 'orders.enc.json'), 'utf8');

    const reopen = () => new EncryptedOrderStore(dir, 'cd'.repeat(32), true);
    expect(reopen).not.toThrow();
    const recovered = reopen();
    expect(recovered.ready).toBe(false);
    expect(recovered.unavailableReason).toMatch(/decifrar/);
    expect(recovered.save(builtOrder())).toBe(false);
    // O arquivo cifrado nunca é reescrito quando a leitura falha.
    expect(readFileSync(join(dir, 'orders.enc.json'), 'utf8')).toBe(original);
  });

  it('não derruba o processo com arquivo cifrado corrompido ou ilegível', () => {
    const garbage = tempDirectory();
    writeFileSync(join(garbage, 'orders.enc.json'), '{json invalido', { mode: 0o600 });
    expect(() => new EncryptedOrderStore(garbage, 'ab'.repeat(32), true)).not.toThrow();
    expect(new EncryptedOrderStore(garbage, 'ab'.repeat(32), true).ready).toBe(false);

    const unreadable = tempDirectory();
    mkdirSync(join(unreadable, 'orders.enc.json'), { recursive: true });
    expect(() => new EncryptedOrderStore(unreadable, 'ab'.repeat(32), true)).not.toThrow();
    expect(new EncryptedOrderStore(unreadable, 'ab'.repeat(32), true).ready).toBe(false);
  });

  // VUL-10: o teto de 10k retornava `false` sem distinção e o endpoint respondia
  // 500 permanente, sem log nem indicador de que era capacidade e não erro de disco.
  it('sinaliza atCapacity quando o teto é atingido e recusa novas escritas', () => {
    const store = new EncryptedOrderStore(tempDirectory(), 'ab'.repeat(32), true);
    expect(store.ready).toBe(true);
    expect(store.atCapacity).toBe(false);
    expect(store.save(builtOrder())).toBe(true);

    const internal = store as unknown as { records: StoredOrderDraft[] };
    const seed = builtOrder();
    internal.records = Array.from({ length: EncryptedOrderStore.MAX_RECORDS }, () => ({ ...seed }));

    expect(store.atCapacity).toBe(true);
    expect(store.save(builtOrder())).toBe(false);
    // Nada foi adicionado: a recusa acontece antes do push.
    expect(store.size).toBe(EncryptedOrderStore.MAX_RECORDS);
  });
});
