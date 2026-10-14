import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_ORDER_RETENTION_DAYS, EncryptedOrderStore, resolveOrderRetentionMs,
  toAdminOrder, type OrderCustomer, type StoredOrderDraft,
} from '../orders';

const tempDirs: string[] = [];
function tempDirectory() {
  const dir = mkdtempSync(join(tmpdir(), 'lola-lgpd-orders-'));
  tempDirs.push(dir);
  return dir;
}
afterEach(() => { for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

const DAY_MS = 86_400_000;
const KEY = 'ab'.repeat(32);

let sequence = 0;
function nextOrderNumber() {
  sequence += 1;
  return 'LOLA-20261010-' + sequence.toString(16).toUpperCase().padStart(12, '0');
}

function customer(overrides: Partial<OrderCustomer> = {}): OrderCustomer {
  return {
    fullName: 'Maria da Silva',
    phone: '21987654321',
    cep: '26300000',
    street: 'Rua das Flores',
    number: '123',
    complement: 'Casa 2',
    neighborhood: 'Centro',
    city: 'Queimados',
    state: 'RJ',
    ...overrides,
  };
}

function order(overrides: Partial<StoredOrderDraft> = {}): StoredOrderDraft {
  const createdAt = overrides.createdAt ?? new Date().toISOString();
  return {
    id: 'ord-' + (sequence += 1),
    orderNumber: nextOrderNumber(),
    createdAt,
    status: 'awaiting_payment_setup',
    paymentStatus: 'not_configured',
    paymentMethod: 'pix',
    shippingOptionId: 'pac',
    termsAccepted: true,
    customer: customer(),
    items: [{
      productId: 'brinco-1', name: 'Brinco Argola Lisa', category: 'Brincos',
      quantity: 1, unitPriceCents: 4990, lineTotalCents: 4990,
    }],
    itemCount: 1,
    subtotalCents: 4990,
    discountCents: 0,
    shippingCents: 1990,
    giftWrapCents: 0,
    totalCents: 6980,
    couponCode: null,
    ...overrides,
  };
}

function store(dir = tempDirectory(), retentionDays?: number) {
  return new EncryptedOrderStore(dir, KEY, false, undefined, retentionDays);
}

describe('retenção de pré-pedidos (LGPD, art. 15, II)', () => {
  it('resolve LOLA_ORDER_RETENTION_DAYS com padrão FINITO de 90 dias', () => {
    expect(DEFAULT_ORDER_RETENTION_DAYS).toBe(90);
    expect(resolveOrderRetentionMs(undefined)).toBe(90 * DAY_MS);
    expect(resolveOrderRetentionMs(Number.NaN)).toBe(90 * DAY_MS);
    expect(resolveOrderRetentionMs(30)).toBe(30 * DAY_MS);
    // 0 é o único caminho para "para sempre", e precisa ser explícito.
    expect(resolveOrderRetentionMs(0)).toBe(0);
    // Fora da faixa arredonda para dentro, nunca vira infinito.
    expect(resolveOrderRetentionMs(99_999)).toBe(3650 * DAY_MS);
    expect(resolveOrderRetentionMs(-10)).toBe(1 * DAY_MS);
    expect(resolveOrderRetentionMs(2.6)).toBe(3 * DAY_MS);
  });

  it('descarta o pré-pedido acima da retenção e regrava o arquivo', () => {
    const dir = tempDirectory();
    const s = store(dir, 30);
    expect(s.retentionMs).toBe(30 * DAY_MS);

    const old = order({ createdAt: new Date(Date.now() - 31 * DAY_MS).toISOString() });
    const recent = order({ createdAt: new Date(Date.now() - 2 * DAY_MS).toISOString() });
    expect(s.save(old)).toBe(true);
    expect(s.save(recent)).toBe(true);
    expect(s.size).toBe(2);

    expect(s.purgeExpired()).toBe(1);
    expect(s.size).toBe(1);
    expect(s.hasOrder(old.orderNumber)).toBe(false);
    expect(s.hasOrder(recent.orderNumber)).toBe(true);

    // Persistido: um novo processo enxerga a exclusão, não só a memória.
    const reopened = store(dir, 30);
    expect(reopened.size).toBe(1);
    expect(reopened.hasOrder(recent.orderNumber)).toBe(true);
    expect(reopened.hasOrder(old.orderNumber)).toBe(false);
  });

  it('não toca nada quando todos os registros estão dentro da retenção', () => {
    const s = store(tempDirectory(), 90);
    const a = order();
    const b = order();
    expect(s.save(a)).toBe(true);
    expect(s.save(b)).toBe(true);

    expect(s.purgeExpired()).toBe(0);
    expect(s.size).toBe(2);
    expect(s.hasOrder(a.orderNumber)).toBe(true);
    expect(s.hasOrder(b.orderNumber)).toBe(true);
  });

  it('trata data ilegível como expirada: registro quebrado não fica para sempre', () => {
    const s = store(tempDirectory(), 30);
    const broken = order({ createdAt: 'nao-e-data' });
    const fine = order();
    expect(s.save(broken)).toBe(true);
    expect(s.save(fine)).toBe(true);

    expect(s.purgeExpired()).toBe(1);
    expect(s.hasOrder(broken.orderNumber)).toBe(false);
    expect(s.hasOrder(fine.orderNumber)).toBe(true);
  });

  it('com retenção desligada (0) nada expira — opt-in explícito', () => {
    const s = store(tempDirectory(), 0);
    expect(s.retentionMs).toBe(0);
    const ancient = order({ createdAt: new Date(Date.now() - 900 * DAY_MS).toISOString() });
    expect(s.save(ancient)).toBe(true);
    expect(s.purgeExpired()).toBe(0);
    expect(s.hasOrder(ancient.orderNumber)).toBe(true);
  });

  it('não expira nada com o armazenamento indisponível', () => {
    // Produção sem chave: `ready=false`, e uma varredura não pode "apagar" nada
    // porque nem existe estado gravável.
    const s = new EncryptedOrderStore(tempDirectory(), undefined, true, undefined, 30);
    expect(s.ready).toBe(false);
    expect(s.purgeExpired()).toBe(0);
  });

  it('expira os registros VELHOS sem derrubar os novos quando a escrita vale', () => {
    const dir = tempDirectory();
    const s = store(dir, 7);
    for (let index = 0; index < 5; index += 1) {
      expect(s.save(order({
        createdAt: new Date(Date.now() - (index + 1) * DAY_MS).toISOString(),
      }))).toBe(true);
    }
    // Idade: 1..5 dias. Retenção de 7 dias mantém todos...
    expect(s.purgeExpired()).toBe(0);
    expect(s.size).toBe(5);

    // ...e com retenção de 3 dias, só os de 1 e 2 dias sobrevivem.
    const shorter = store(dir, 3);
    expect(shorter.purgeExpired()).toBe(3);
    expect(shorter.size).toBe(2);
    for (const record of shorter.listRecent(10)) {
      expect(Date.now() - Date.parse(record.createdAt)).toBeLessThanOrEqual(3 * DAY_MS);
    }
  });
});

describe('busca por telefone e por nome (LGPD, art. 18, I e V)', () => {
  it('encontra o titular pelo telefone digitado de qualquer forma', () => {
    const s = store();
    const target = order({ customer: customer({ phone: '21987654321' }) });
    expect(s.save(target)).toBe(true);
    expect(s.save(order({ customer: customer({ phone: '11911112222' }) }))).toBe(true);

    for (const query of ['21987654321', '(21) 98765-4321', '21 9 8765-4321', '+55 21 98765-4321']) {
      const found = s.findByPhone(query);
      expect(found, query).toHaveLength(1);
      expect(found[0].orderNumber).toBe(target.orderNumber);
    }
  });

  it('aceita DDD 55 (Santa Maria) sem cortar como se fosse código do país', () => {
    const s = store();
    const rs = order({ customer: customer({ phone: '5599998888' }) });
    expect(s.save(rs)).toBe(true);

    expect(s.findByPhone('55 3221-4455').map((r) => r.orderNumber)).toEqual([]);
    expect(s.findByPhone('5599998888').map((r) => r.orderNumber)).toEqual([rs.orderNumber]);
    expect(s.findByPhone('(55) 9999-8888').map((r) => r.orderNumber)).toEqual([rs.orderNumber]);
  });

  it('devolve cópias: alterar o resultado não mexe no registro gravado', () => {
    const s = store();
    const saved = order();
    expect(s.save(saved)).toBe(true);

    const found = s.findByPhone('21987654321');
    found[0].customer.fullName = 'Nome alterado fora do armazenamento';
    expect(s.findByOrderNumber(saved.orderNumber)?.customer.fullName).toBe('Maria da Silva');
  });

  it('reconstrói o índice ao recarregar o arquivo do disco', () => {
    const dir = tempDirectory();
    const first = store(dir);
    const saved = order();
    expect(first.save(saved)).toBe(true);

    const reopened = store(dir);
    expect(reopened.findByPhone('+55 (21) 98765-4321').map((r) => r.orderNumber))
      .toEqual([saved.orderNumber]);
  });

  it('busca por nome ignora acento e caixa', () => {
    const s = store();
    const joao = order({ customer: customer({ fullName: 'João da Conceição', phone: '21900000001' }) });
    expect(s.save(joao)).toBe(true);
    expect(s.save(order({ customer: customer({ fullName: 'Ana Souza', phone: '21900000002' }) }))).toBe(true);

    expect(s.searchByName('JOAO').map((r) => r.orderNumber)).toEqual([joao.orderNumber]);
    expect(s.searchByName('concei').map((r) => r.orderNumber)).toEqual([joao.orderNumber]);
    expect(s.searchByName('   ').map((r) => r.orderNumber)).toEqual([]);
    expect(s.searchByName('nome que não existe')).toEqual([]);
  });

  it('searchByTitular combina telefone e nome e devolve do mais recente', () => {
    const s = store();
    const older = order({ createdAt: '2026-01-01T10:00:00.000Z' });
    const newer = order({ createdAt: '2026-06-01T10:00:00.000Z' });
    const other = order({ customer: customer({ phone: '11900000009', fullName: 'Antônio Pereira' }) });
    expect(s.save(older)).toBe(true);
    expect(s.save(newer)).toBe(true);
    expect(s.save(other)).toBe(true);

    // Só telefone: os dois do titular, mais recente primeiro.
    expect(s.searchByTitular({ phone: '21 9 8765-4321' }).map((r) => r.orderNumber))
      .toEqual([newer.orderNumber, older.orderNumber]);
    // Telefone + nome que não bate: interseção vazia.
    expect(s.searchByTitular({ phone: '21987654321', name: 'Joana' })).toEqual([]);
    // Só nome: pega as duas Marias.
    expect(s.searchByTitular({ name: 'maria' })).toHaveLength(2);
    // Sem critério nenhum não é busca, é exportação acidental de tudo.
    expect(s.searchByTitular({})).toEqual([]);
    expect(s.searchByTitular({ phone: '', name: '   ' })).toEqual([]);
  });

  it('a busca por titular responde "existe tratamento?" mesmo sem número do pedido', () => {
    const s = store();
    const saved = order();
    expect(s.save(saved)).toBe(true);

    // O titular não tem o orderNumber em mãos: só o telefone.
    expect(s.searchByTitular({ phone: saved.customer.phone })).toHaveLength(1);
    expect(s.hasOrder('LOLA-99999999-ABCDEF123456')).toBe(false);
  });
});

describe('direitos do titular sobre o arquivo cifrado (art. 18, V e VI)', () => {
  it('redact apaga dado pessoal e mantém a casca comercial', () => {
    const dir = tempDirectory();
    const s = store(dir);
    const target = order();
    expect(s.save(target)).toBe(true);

    expect(s.redact(target.orderNumber, new Date('2026-10-13T12:00:00.000Z'))).toBe(true);

    const kept = s.findByOrderNumber(target.orderNumber);
    expect(kept).toBeDefined();
    expect(kept!.customer.fullName).toBe('');
    expect(kept!.customer.phone).toBe('');
    expect(kept!.customer.cep).toBe('');
    expect(kept!.customer.street).toBe('');
    expect(kept!.redactedAt).toBe('2026-10-13T12:00:00.000Z');
    // O que é comercial continua: número, itens e totais auditáveis.
    expect(kept!.items).toEqual(target.items);
    expect(kept!.totalCents).toBe(target.totalCents);
    expect(toAdminOrder(kept!).redacted).toBe(true);

    // Nenhum dado pessoal sobrevive no plaintext nem no disco.
    expect(JSON.stringify(kept)).not.toContain('Maria da Silva');
    expect(JSON.stringify(kept)).not.toContain('21987654321');
    expect(s.findByPhone(target.customer.phone)).toEqual([]);

    const reopened = store(dir);
    const afterReload = reopened.findByOrderNumber(target.orderNumber);
    expect(afterReload?.redactedAt).toBe('2026-10-13T12:00:00.000Z');
    expect(afterReload?.customer.fullName).toBe('');
    expect(toAdminOrder(afterReload!).redacted).toBe(true);
  });

  it('redact não faz nada com número inexistente', () => {
    const s = store();
    expect(s.save(order())).toBe(true);
    expect(s.redact('LOLA-99999999-ABCDEF123456')).toBe(false);
    expect(s.size).toBe(1);
  });

  it('remove elimina o registro e reescreve o arquivo com a MESMA chave', () => {
    const dir = tempDirectory();
    const s = store(dir);
    const victim = order();
    const survivor = order({ customer: customer({ phone: '11977776666' }) });
    expect(s.save(victim)).toBe(true);
    expect(s.save(survivor)).toBe(true);

    expect(s.remove(victim.orderNumber)).toBe(true);
    expect(s.size).toBe(1);
    expect(s.findByPhone(victim.customer.phone)).toEqual([]);

    // Sem rotação de chave: o registro vizinho continua legível no novo processo.
    const reopened = store(dir);
    expect(reopened.size).toBe(1);
    expect(reopened.findByOrderNumber(survivor.orderNumber)?.customer.phone).toBe('11977776666');
    expect(reopened.findByOrderNumber(victim.orderNumber)).toBeUndefined();

    // E a chave em si continua a mesma que já estava no diretório.
    expect(readFileSync(join(dir, 'orders.enc.json'), 'utf8')).toContain('"version":2');
  });

  it('remove devolve false para registro inexistente, sem reescrever', () => {
    const s = store();
    const kept = order();
    expect(s.save(kept)).toBe(true);
    expect(s.remove('LOLA-99999999-ABCDEF123456')).toBe(false);
    expect(s.size).toBe(1);
    expect(s.hasOrder(kept.orderNumber)).toBe(true);
  });

  it('remove e redact recusam quando o armazenamento está indisponível', () => {
    const unavailable = new EncryptedOrderStore(tempDirectory(), undefined, true, undefined, 30);
    expect(unavailable.ready).toBe(false);
    expect(unavailable.remove('LOLA-20261010-000000000001')).toBe(false);
    expect(unavailable.redact('LOLA-20261010-000000000001')).toBe(false);
  });

  it('o telefone apagado sai do índice e o telefone do vizinho continua achável', () => {
    const s = store();
    const first = order({ customer: customer({ phone: '21987654321' }) });
    const second = order({ customer: customer({ phone: '21987654322' }) });
    expect(s.save(first)).toBe(true);
    expect(s.save(second)).toBe(true);

    expect(s.remove(first.orderNumber)).toBe(true);
    expect(s.findByPhone('21987654321')).toEqual([]);
    expect(s.findByPhone('21 98765-4322').map((r) => r.orderNumber)).toEqual([second.orderNumber]);
  });
});
