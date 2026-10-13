import { afterEach, describe, expect, it } from 'vitest';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { buildOrderDraft, EncryptedOrderStore, ORDERS_AAD, type StoredOrderDraft, type OrderCatalogProduct } from '../orders';
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
    expect(store.unavailableReason).toMatch(/LOLA_ORDERS_KEY_FILE/);
  });
  it('aceita chave de 32 bytes em hexadecimal', () => {
    const store = new EncryptedOrderStore(tempDirectory(), 'ab'.repeat(32), true);
    expect(store.ready).toBe(true);
    expect(store.save(builtOrder())).toBe(true);
  });

  // VUL-17: uma chave criada ao lado do ciphertext faz com que qualquer cópia de
  // backup de .data/ leve os dois juntos. LOLA_ORDERS_KEY_FILE permite guardar a
  // chave fora, em volume de segredo montado só-leitura.
  describe('LOLA_ORDERS_KEY_FILE (chave fora do diretório de dados)', () => {
    it('carrega a chave de um arquivo externo sem materializá-la em .data', () => {
      const data = tempDirectory();
      const keyFile = join(tempDirectory(), 'segredo.key');
      writeFileSync(keyFile, 'ab'.repeat(32) + '\n', { mode: 0o600 });
      chmodSync(keyFile, 0o600);

      const store = new EncryptedOrderStore(data, undefined, true, keyFile);
      expect(store.ready).toBe(true);
      expect(store.save(builtOrder())).toBe(true);
      expect(existsSync(join(data, 'orders.key'))).toBe(false);

      const reopened = new EncryptedOrderStore(data, undefined, true, keyFile);
      expect(reopened.ready).toBe(true);
      expect(reopened.size).toBe(1);
    });

    it('recusa arquivo de chave com permissão aberta em produção', () => {
      const keyFile = join(tempDirectory(), 'segredo.key');
      writeFileSync(keyFile, 'ab'.repeat(32), { mode: 0o644 });
      chmodSync(keyFile, 0o644);
      const store = new EncryptedOrderStore(tempDirectory(), undefined, true, keyFile);
      expect(store.ready).toBe(false);
      expect(store.unavailableReason).toMatch(/0600/);
      expect(store.save(builtOrder())).toBe(false);
    });

    it('recusa arquivo de chave ausente ou malformado', () => {
      const ausente = new EncryptedOrderStore(
        tempDirectory(), undefined, true, join(tempDirectory(), 'nao-existe.key'),
      );
      expect(ausente.ready).toBe(false);
      expect(ausente.save(builtOrder())).toBe(false);

      const ruim = join(tempDirectory(), 'segredo.key');
      writeFileSync(ruim, 'não é hexadecimal', { mode: 0o600 });
      const malformado = new EncryptedOrderStore(tempDirectory(), undefined, true, ruim);
      expect(malformado.ready).toBe(false);
      expect(malformado.unavailableReason).toMatch(/64 caracteres/);
    });

    it('a variável de ambiente tem precedência sobre o arquivo', () => {
      const data = tempDirectory();
      const keyFile = join(tempDirectory(), 'segredo.key');
      writeFileSync(keyFile, 'cd'.repeat(32), { mode: 0o600 });
      chmodSync(keyFile, 0o600);

      const store = new EncryptedOrderStore(data, 'ab'.repeat(32), true, keyFile);
      expect(store.ready).toBe(true);
      expect(store.save(builtOrder())).toBe(true);

      // Se o arquivo tivesse sido usado, o reabrir com a mesma chave externa
      // decifraria. Como quem cifrou foi a env, o arquivo não serve.
      const reopened = new EncryptedOrderStore(data, undefined, true, keyFile);
      expect(reopened.ready).toBe(false);
      expect(reopened.unavailableReason).toMatch(/decifrar/);
    });
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

describe('EncryptedOrderStore — AAD do envelope (VUL-J)', () => {
  const readKey = (dir: string) =>
    Buffer.from(readFileSync(join(dir, 'orders.key'), 'utf8').trim(), 'hex');

  const readEnvelope = (dir: string) =>
    JSON.parse(readFileSync(join(dir, 'orders.enc.json'), 'utf8')) as
      { version: number; iv: string; tag: string; ciphertext: string };

  function reencrypt(
    key: Buffer,
    plaintext: Buffer,
    version: number,
    aad?: Buffer,
  ): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    if (aad) cipher.setAAD(aad);
    const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return JSON.stringify({
      version, iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'),
      ciphertext: body.toString('hex'),
    }) + '\n';
  }

  function decryptWith(key: Buffer, envelope: { iv: string; tag: string; ciphertext: string }, aad?: Buffer): Buffer {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'hex'));
    if (aad) decipher.setAAD(aad);
    decipher.setAuthTag(Buffer.from(envelope.tag, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'hex')), decipher.final()]);
  }

  it('grava envelope na versão que exige AAD', () => {
    const dir = tempDirectory();
    const store = new EncryptedOrderStore(dir);
    expect(store.save(builtOrder())).toBe(true);
    expect(readEnvelope(dir).version).toBe(2);
  });

  it('recusa envelope re-cifrado sem o AAD, mesmo com a chave certa', () => {
    const dir = tempDirectory();
    const store = new EncryptedOrderStore(dir);
    const order = builtOrder();
    expect(store.save(order)).toBe(true);

    const key = readKey(dir);
    const envelope = readEnvelope(dir);
    const plaintext = decryptWith(key, envelope, Buffer.from(ORDERS_AAD, 'utf8'));

    // Mesmo conteúdo, mesma chave, IV novo — só o contexto de autenticação some.
    // Antes do AAD isto decifrava em silêncio: qualquer envelope válido do
    // serviço era aceito em qualquer lugar.
    writeFileSync(join(dir, 'orders.enc.json'), reencrypt(key, plaintext, 2));

    const tampered = new EncryptedOrderStore(dir);
    expect(tampered.ready).toBe(false);
    expect(tampered.hasOrder(order.orderNumber)).toBe(false);
  });

  it('recusa envelope de outra aplicação que use a mesma chave', () => {
    const dir = tempDirectory();
    const store = new EncryptedOrderStore(dir);
    expect(store.save(builtOrder())).toBe(true);

    const key = readKey(dir);
    const plaintext = decryptWith(key, readEnvelope(dir), Buffer.from(ORDERS_AAD, 'utf8'));
    writeFileSync(join(dir, 'orders.enc.json'), reencrypt(key, plaintext, 2, Buffer.from('outro-sistema|outro-arquivo', 'utf8')));

    expect(new EncryptedOrderStore(dir).ready).toBe(false);
  });

  it('ainda lê o envelope v1 gravado antes do AAD', () => {
    const dir = tempDirectory();
    const key = 'cd'.repeat(32);
    const plaintext = Buffer.from(JSON.stringify([builtOrder()]), 'utf8');

    writeFileSync(join(dir, 'orders.enc.json'), reencrypt(Buffer.from(key, 'hex'), plaintext, 1));
    writeFileSync(join(dir, 'orders.key'), key + '\n');

    const legacy = new EncryptedOrderStore(dir);
    expect(legacy.ready).toBe(true);
    expect(legacy.size).toBe(1);
  });

  it('recusa versão desconhecida em vez de decifrar às cegas', () => {
    const dir = tempDirectory();
    const key = 'ef'.repeat(32);
    const plaintext = Buffer.from(JSON.stringify([]), 'utf8');

    writeFileSync(join(dir, 'orders.enc.json'), reencrypt(Buffer.from(key, 'hex'), plaintext, 99, Buffer.from(ORDERS_AAD, 'utf8')));
    writeFileSync(join(dir, 'orders.key'), key + '\n');

    expect(new EncryptedOrderStore(dir).ready).toBe(false);
  });
});

describe('CEP no servidor', () => {
  const customer = validInput().customer;
  const withCep = (cep: string) => buildOrderDraft(validInput({ customer: { ...customer, cep } }), catalog, inventory());

  it('aceita CEP real, com ou sem máscara', () => {
    expect(withCep('01310-100').ok).toBe(true);
    expect(withCep('01310100').ok).toBe(true);
    expect(withCep('26300-000').ok).toBe(true);
    expect(withCep('20040-020').ok).toBe(true);
  });

  // VUL-CEP: só o tamanho era conferido, então `00000000` e `11111111` — o
  // preenchimento de quem está passando pela validação — passavam direto.
  it('recusa sequências degeneradas que nunca foram CEP', () => {
    for (const cep of ['00000-000', '11111-111', '55555-555', '99999-999']) {
      const result = withCep(cep);
      expect(result.ok, cep).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/CEP brasileiro válido/);
    }
  });

  it('recusa CEP fora da faixa real brasileira (abaixo de 01000-000)', () => {
    const result = withCep('00123-456');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/CEP brasileiro válido/);
  });

  it('recusa tamanhos errados', () => {
    expect(withCep('1234').ok).toBe(false);
    expect(withCep('').ok).toBe(false);
    expect(withCep('123456789').ok).toBe(false);
    expect(withCep('abcdefgh').ok).toBe(false);
  });
});

describe('regras de cupom aplicadas pelo servidor', () => {
  const dentroDaValidade = new Date('2026-11-15T12:00:00.000Z');
  const noPedido = (overrides: Record<string, unknown>, now = dentroDaValidade, couponUses?: (code: string) => number) =>
    buildOrderDraft(validInput(overrides), catalog, inventory(), now, couponUses);

  it('concede o desconto quando a regra passa', () => {
    const result = noPedido({});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.order.couponCode).toBe('LOLA10');
    expect(result.order.discountCents).toBe(998);
  });

  it('recusa cupom vencido mesmo com subtotal cheio', () => {
    const result = noPedido({}, new Date('2027-06-01T12:00:00.000Z'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/expirou/);
  });

  it('recusa BEMVINDA abaixo do subtotal mínimo', () => {
    // 2 brincos = R$ 99,80, abaixo do mínimo de R$ 150,00 do BEMVINDA.
    const result = noPedido({ couponCode: 'bemvinda' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/a partir de R\$/);
  });

  it('aceita BEMVINDA quando o subtotal alcança o mínimo', () => {
    // 4 brincos = R$ 199,60, acima de R$ 150,00.
    const result = noPedido({ couponCode: 'bemvinda', items: [{ productId: 'brinco-1', quantity: 4 }] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.order.discountCents).toBe(Math.round(19960 * 15 / 100));
  });

  it('recusa o cupom quando o teto de usos foi atingido', () => {
    const result = noPedido({}, dentroDaValidade, (code) => (code === 'LOLA10' ? 200 : 0));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/limite de usos/);
  });

  it('concede quando ainda há uso sobrando', () => {
    expect(noPedido({}, dentroDaValidade, () => 199).ok).toBe(true);
  });

  it('não exige quem conte usos para validar validade e mínimo', () => {
    expect(noPedido({ couponCode: 'bemvinda' }, dentroDaValidade, undefined).ok).toBe(false);
    expect(noPedido({}, dentroDaValidade, undefined).ok).toBe(true);
  });

  it('recusa código desconhecido sem contar como uso', () => {
    let consultas = 0;
    const result = noPedido({ couponCode: 'GRATIS100' }, dentroDaValidade, () => { consultas += 1; return 0; });
    expect(result.ok).toBe(false);
    // A existência é conferida antes de consultar o armazenamento.
    expect(consultas).toBe(0);
    if (!result.ok) expect(result.error).toMatch(/não é válido/);
  });
});

describe('couponUseCount', () => {
  it('conta os pré-pedidos gravados por este cupom, ignorando caixa', () => {
    const dir = tempDirectory();
    const key = 'ab'.repeat(32);
    writeFileSync(join(dir, 'orders.key'), key + '\n');
    const store = new EncryptedOrderStore(dir);
    expect(store.ready).toBe(true);

    const noCupom = () => buildOrderDraft(validInput({ couponCode: null }), catalog, inventory());

    const semCupom = noCupom();
    if (!semCupom.ok) throw new Error(semCupom.error);

    expect(store.save({ ...builtOrder(), couponCode: 'LOLA10' })).toBe(true);
    expect(store.save({ ...builtOrder(), couponCode: 'lola10' })).toBe(true);
    expect(store.save(semCupom.order)).toBe(true);

    expect(store.couponUseCount('LOLA10')).toBe(2);
    expect(store.couponUseCount('lola10')).toBe(2);
    expect(store.couponUseCount('  lola10  ')).toBe(2);
    expect(store.couponUseCount('BEMVINDA')).toBe(0);
    expect(store.couponUseCount('inexistente')).toBe(0);
  });

  it('conta sempre do zero num armazenamento vazio', () => {
    const dir = tempDirectory();
    writeFileSync(join(dir, 'orders.key'), 'cd'.repeat(32) + '\n');
    expect(new EncryptedOrderStore(dir).couponUseCount('LOLA10')).toBe(0);
  });
});
