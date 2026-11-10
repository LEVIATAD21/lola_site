import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CatalogStore } from '../catalogStore';

const dirs: string[] = [];
function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'lola-catalog-test-'));
  dirs.push(dir);
  return dir;
}
const valid = {
  name: 'Brinco de teste',
  category: 'Brincos',
  price: 42.9,
  material: 'Aço inox',
  color: 'Prata',
  desc: 'Produto criado em teste.',
  image: '/images/brinco-teste.webp',
};

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('CatalogStore persistente', () => {
  it('cria produto com ID do servidor e persiste após reinicialização', () => {
    const dir = tempDir();
    const first = new CatalogStore(dir);
    const created = first.create(valid);
    expect(created).not.toBeNull();
    expect(created?.id).toMatch(/^prod-[a-f0-9]{16}$/);
    expect(created?.disponivel).toBe(0);
    expect(created?.published).toBe(true);

    const restarted = new CatalogStore(dir);
    expect(restarted.find(created!.id)).toMatchObject({
      id: created!.id, name: valid.name, price: valid.price,
    });
  });

  it('migra catálogo antigo e mantém produto oculto após reinicialização', () => {
    const dir = tempDir();
    const legacy = { id: 'prod-legacy001', ...valid, disponivel: 2 };
    writeFileSync(join(dir, 'catalog.json'), JSON.stringify([legacy]));
    const store = new CatalogStore(dir);
    expect(store.find(legacy.id)?.published).toBe(true);
    const persisted = JSON.parse(readFileSync(join(dir, 'catalog.json'), 'utf8'));
    expect(persisted[0].published).toBe(true);

    const hidden = store.update(legacy.id, { ...valid, published: false });
    expect(hidden?.published).toBe(false);
    expect(new CatalogStore(dir).find(legacy.id)?.published).toBe(false);
  });

  it('rejeita preço inválido, categoria desconhecida e imagem ativa', () => {
    const store = new CatalogStore(tempDir());
    expect(store.create({ ...valid, price: Number.NaN })).toBeNull();
    expect(store.create({ ...valid, category: 'Acessórios' })).toBeNull();
    expect(store.create({ ...valid, image: 'javascript:alert(1)' })).toBeNull();
    expect(store.create({ ...valid, image: '//evil.example/tracker.png' })).toBeNull();
    expect(store.create({ ...valid, image: '/../private/file.png' })).toBeNull();
    expect(store.create({ ...valid, image: '/%2e%2e/private/file.png' })).toBeNull();
    expect(store.create({ ...valid, image: 'https://user:password@evil.example/image.png' })).toBeNull();
    expect(store.create({ ...valid, image: 'http://evil.example/image.png' })).toBeNull();
    expect(store.create({ ...valid, name: ' '.repeat(121) })).toBeNull();
  });

  it('atualiza somente os campos de catálogo e preserva a disponibilidade', () => {
    const store = new CatalogStore(tempDir());
    const created = store.create(valid)!;
    const updated = store.update(created.id, { ...valid, name: 'Brinco atualizado', price: 55 });
    expect(updated).toMatchObject({ id: created.id, name: 'Brinco atualizado', price: 55, disponivel: 0 });
    expect(store.update('id-inexistente', valid)).toBeNull();
  });

  it('grava arquivo sem dados adicionais enviados pelo cliente', () => {
    const dir = tempDir();
    const store = new CatalogStore(dir);
    const created = store.create({ ...valid, id: '__proto__', disponivel: 999, total: 999 });
    expect(created).not.toBeNull();
    const persisted = JSON.parse(readFileSync(join(dir, 'catalog.json'), 'utf8'));
    const record = persisted.find((item: { id: string }) => item.id === created!.id);
    expect(record).not.toHaveProperty('total');
    expect(record.disponivel).toBe(0);
    expect(record.id).not.toBe('__proto__');
  });

  it('remove produto persistido sem afetar outros IDs', () => {
    const dir = tempDir();
    const store = new CatalogStore(dir);
    const created = store.create(valid)!;
    expect(store.remove(created.id)).toBe(true);
    expect(new CatalogStore(dir).find(created.id)).toBeUndefined();
    expect(store.remove(created.id)).toBe(false);
  });
});
