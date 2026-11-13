import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CATALOG_INFO } from '../catalog';
import {
  CAPACIDADE_ESGOTADA, createLocalDataPlane, PEDIDOS_INDISPONIVEL, type LocalDataPlane,
} from '../dataPlane';
import { createInitialStock } from '../stock';

const tempDirs: string[] = [];

function tempDirectory() {
  const dir = mkdtempSync(join(tmpdir(), 'lola-plane-test-'));
  tempDirs.push(dir);
  return dir;
}

function makePlane(overrides: { production?: boolean; encryptionKey?: string } = {}): LocalDataPlane {
  return createLocalDataPlane({
    dataDir: tempDirectory(),
    production: overrides.production ?? false,
    reservationTtlMs: 60_000,
    encryptionKey: overrides.encryptionKey ?? 'ab'.repeat(32),
  });
}

function validDraft(overrides: Record<string, unknown> = {}) {
  return {
    customer: {
      fullName: 'Maria da Silva',
      phone: '11987654321',
      cep: '01310100',
      street: 'Avenida Paulista',
      number: '1000',
      complement: 'Apto 12',
      neighborhood: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
    },
    paymentMethod: 'pix',
    shippingOptionId: 'pac',
    giftWrap: false,
    termsAccepted: true,
    items: [{ productId: 'brinco-1', quantity: 1 }],
    ...overrides,
  };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('LocalDataPlane.snapshot', () => {
  it('devolve disponibilidade líquida para todo o catálogo', async () => {
    const plane = makePlane();
    const stock = await plane.snapshot();

    expect(stock).not.toBeNull();
    for (const product of CATALOG_INFO) {
      expect(typeof stock?.[product.id]).toBe('number');
    }
    // brinco-1 começa com 8 unidades no estoque inicial.
    expect(stock?.['brinco-1']).toBe(createInitialStock()['brinco-1'].disponivel);
  });

  it('reflete a reserva assim que um pré-pedido passa', async () => {
    const plane = makePlane();
    const antes = (await plane.snapshot())?.['brinco-1'] ?? 0;

    await plane.createDraft(validDraft({ items: [{ productId: 'brinco-1', quantity: 3 }] }), { ip: '127.0.0.1' });

    const depois = (await plane.snapshot())?.['brinco-1'] ?? 0;
    expect(depois).toBe(antes - 3);
  });
});

describe('LocalDataPlane — CRUD persistente de catálogo', () => {
  const productInput = {
    name: 'Produto administrativo de teste',
    category: 'Brincos',
    price: 37.5,
    material: 'Aço inox',
    color: 'Prata',
    desc: 'Criado pelo teste de integração do plano de dados.',
    image: '/images/teste.webp',
  };

  it('cria produto, inicializa estoque, atualiza dados e protege exclusão com saldo', async () => {
    const plane = makePlane();
    const created = plane.createProduct(productInput);
    expect(created).not.toBeNull();
    expect(created?.id).toMatch(/^prod-[a-f0-9]{16}$/);
    expect(plane.inventory.get(created!.id)).toMatchObject({
      productId: created!.id, total: 0, reservado: 0, vendido: 0, disponivel: 0,
    });

    expect(plane.setProductStock(created!.id, 9)).toMatchObject({ ok: true, stock: { total: 9, disponivel: 9 } });
    const updated = plane.updateProduct(created!.id, { ...productInput, name: 'Produto atualizado', price: 49.9 });
    expect(updated).toMatchObject({ id: created!.id, name: 'Produto atualizado', price: 49.9 });
    expect(plane.inventory.get(created!.id)?.disponivel).toBe(9);

    expect(plane.removeProduct(created!.id)).toBe(false);
    expect(plane.setProductStock(created!.id, 0).ok).toBe(true);
    expect(plane.removeProduct(created!.id)).toBe(true);
    expect((await plane.catalog())?.some((product) => product.id === created!.id)).toBe(false);
    expect(plane.inventory.get(created!.id)).toBeUndefined();
  });

  it('não cria produto com categoria ou preço inválido', () => {
    const plane = makePlane();
    expect(plane.createProduct({ ...productInput, category: 'Acessórios' })).toBeNull();
    expect(plane.createProduct({ ...productInput, price: Number.POSITIVE_INFINITY })).toBeNull();
  });
});

describe('LocalDataPlane.createDraft', () => {
  it('registra um pedido válido sem expor dado pessoal na resposta', async () => {
    const plane = makePlane();
    const result = await plane.createDraft(validDraft(), { ip: '127.0.0.1' });

    expect(result.status).toBe(201);
    expect(result.body.success).toBe(true);
    const order = result.body.order as Record<string, unknown>;
    // A vitrine recebe o resumo público: nada de nome, telefone ou endereço.
    expect(Object.keys(order).sort()).toEqual([
      'createdAt', 'discount', 'giftWrap', 'itemCount', 'orderNumber',
      'paymentMethod', 'paymentStatus', 'shipping', 'shippingOptionId',
      'status', 'subtotal', 'total',
    ].sort());
    expect(JSON.stringify(order)).not.toContain('11987654321');
    expect(JSON.stringify(order)).not.toContain('Paulista');
  });

  it('é autoritativo em preço: preço, subtotal e total do cliente são ignorados', async () => {
    const semAtaque = await makePlane().createDraft(validDraft(), { ip: '127.0.0.1' });

    const comAtaque = await makePlane().createDraft(validDraft({
      items: [{ productId: 'brinco-1', quantity: 1, unitPriceCents: 0, lineTotalCents: 0, price: 0 }],
      subtotal: 0, discount: 0, total: 0, subtotalCents: 0, totalCents: 0, discountCents: 0,
      shipping: 0,
    }), { ip: '127.0.0.1' });

    expect(comAtaque.status).toBe(201);
    expect((comAtaque.body.order as Record<string, number>).total)
      .toBe((semAtaque.body.order as Record<string, number>).total);
    expect((comAtaque.body.order as Record<string, number>).subtotal).toBeGreaterThan(0);
  });

  it('impede oversell mesmo com pedidos concorrentes', async () => {
    const plane = makePlane();
    const disponivel = (await plane.snapshot())?.['brinco-1'] ?? 0;

    const respostas = await Promise.all(
      Array.from({ length: 12 }, (_, index) => plane.createDraft(
        validDraft({ items: [{ productId: 'brinco-1', quantity: 4 }] }),
        { ip: `10.0.0.${index + 1}` },
      )),
    );

    const aceitos = respostas.filter((resposta) => resposta.status === 201);
    expect(aceitos.length).toBe(Math.floor(disponivel / 4));
    expect(respostas.some((resposta) => resposta.status === 409)).toBe(true);
    expect((await plane.snapshot())?.['brinco-1']).toBe(disponivel % 4);
  });

  it('recusa corpo que não é objeto', async () => {
    const plane = makePlane();
    for (const invalido of [null, 'texto', 42, ['lista']]) {
      const result = await plane.createDraft(invalido, { ip: '127.0.0.1' });
      expect(result.status).toBe(400);
    }
  });

  // VUL-09: nada de marcação nos campos de texto que o painel admin reexibe.
  it('recusa marcação nos campos de endereço', async () => {
    const plane = makePlane();
    const result = await plane.createDraft(validDraft({
      customer: { ...validDraft().customer, fullName: '<script>alert(1)</script>' },
    }), { ip: '127.0.0.1' });

    expect(result.status).toBe(400);
  });
});

describe('LocalDataPlane sem armazenamento de pedidos', () => {
  // Produção sem chave nenhuma: o plano sobe, o estoque continua legível, e os
  // pré-pedidos ficam desligados em vez de derrubar o processo (VUL-05).
  function planeSemChave(): LocalDataPlane {
    return createLocalDataPlane({
      dataDir: tempDirectory(),
      production: true,
      reservationTtlMs: 60_000,
    });
  }

  // VUL-18: o motivo real (chave ausente, malformada, permissão errada, cifra
  // corrompida) não pode chegar ao cliente — ele é um oráculo de configuração.
  it('devolve 503 genérico e nunca vaza o motivo da indisponibilidade', async () => {
    const result = await planeSemChave().createDraft(validDraft(), { ip: '127.0.0.1' });

    expect(result.status).toBe(503);
    expect(result.body.error).toBe(PEDIDOS_INDISPONIVEL);
    const texto = JSON.stringify(result.body);
    expect(texto).not.toContain('LOLA_');
    expect(texto).not.toContain('.data');
    expect(texto).not.toContain('orders.enc.json');
    expect(texto).not.toContain('orders.key');
  });

  it('sobe sem lançar e mantém o estoque legível', async () => {
    const plane = planeSemChave();

    expect(plane.orders.ready).toBe(false);
    await expect(plane.snapshot()).resolves.not.toBeNull();
  });

  it('mantém a mensagem de capacidade separada da de indisponibilidade', () => {
    expect(CAPACIDADE_ESGOTADA).not.toBe(PEDIDOS_INDISPONIVEL);
    expect(CAPACIDADE_ESGOTADA).not.toContain('LOLA_');
  });
});
