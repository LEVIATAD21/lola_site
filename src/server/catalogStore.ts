import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CATALOG_INFO, type CatalogInfo } from './catalog';

const CATEGORIES = new Set(['Brincos', 'Colares', 'Pulseiras', 'Anéis', 'Conjuntos']);
const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{1,63}$/;

export type CatalogInput = {
  name: string;
  category: string;
  price: number;
  material: string;
  color: string;
  desc: string;
  image: string;
  published: boolean;
};

function validProduct(value: unknown): value is CatalogInfo {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const p = value as Record<string, unknown>;
  return typeof p.id === 'string' && ID_PATTERN.test(p.id) &&
    typeof p.name === 'string' && p.name.trim().length > 0 && p.name.length <= 120 &&
    typeof p.category === 'string' && CATEGORIES.has(p.category) &&
    typeof p.price === 'number' && Number.isFinite(p.price) && p.price >= 0 && p.price <= 100000 &&
    typeof p.material === 'string' && p.material.length <= 80 &&
    typeof p.color === 'string' && p.color.length <= 80 &&
    typeof p.desc === 'string' && p.desc.length <= 2000 &&
    typeof p.image === 'string' && p.image.length <= 2048 &&
    typeof p.published === 'boolean' &&
    typeof p.disponivel === 'number' && Number.isSafeInteger(p.disponivel) && p.disponivel >= 0;
}

function normalizeInput(value: unknown): CatalogInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const p = value as Record<string, unknown>;
  const fields = ['name', 'category', 'material', 'color', 'desc', 'image'] as const;
  if (fields.some((field) => typeof p[field] !== 'string')) return null;
  if (p.published !== undefined && typeof p.published !== 'boolean') return null;
  if (typeof p.price !== 'number' || !Number.isFinite(p.price) || p.price < 0 || p.price > 100000) return null;
  const result = {
    name: (p.name as string).trim(),
    category: p.category as string,
    price: Math.round(p.price * 100) / 100,
    material: (p.material as string).trim(),
    color: (p.color as string).trim(),
    desc: (p.desc as string).trim(),
    image: (p.image as string).trim(),
    published: typeof p.published === 'boolean' ? p.published : true,
  };
  if (!result.name || result.name.length > 120 || !CATEGORIES.has(result.category) ||
      result.material.length > 80 || result.color.length > 80 || result.desc.length > 2000 ||
      result.image.length > 2048) return null;
  if (result.image) {
    const localPath = result.image.startsWith('/') &&
      !result.image.startsWith('//') &&
      !/[\\u0000-\\u001f\\\\]/.test(result.image) &&
      !result.image.split(/[?#]/)[0].split('/').some((segment) => segment === '..') &&
      !/%2e/i.test(result.image);
    let remoteHttps = false;
    if (/^https:\/\//i.test(result.image) && !/\\s/.test(result.image)) {
      try {
        const imageUrl = new URL(result.image);
        remoteHttps = imageUrl.protocol === 'https:' && Boolean(imageUrl.hostname) &&
          !imageUrl.username && !imageUrl.password;
      } catch {
        remoteHttps = false;
      }
    }
    if (!localPath && !remoteHttps) return null;
  }
  return result;
}

/** Persistência atômica do catálogo; somente o processo privado instancia esta classe. */
export class CatalogStore {
  private products: CatalogInfo[];
  private readonly filePath: string;

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, 'catalog.json');
    this.products = CATALOG_INFO.map((product) => ({ ...product }));
    if (existsSync(this.filePath)) this.load();
    else this.persist();
  }

  private load(): void {
    const parsed: unknown = JSON.parse(readFileSync(this.filePath, 'utf8'));
    if (!Array.isArray(parsed) || parsed.length > 5000) {
      throw new Error('Arquivo persistido do catálogo inválido; inicialização recusada.');
    }
    const needsMigration = parsed.some((value) =>
      Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
        typeof (value as Record<string, unknown>).published !== 'boolean')
    );
    const migrated = parsed.map((value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
      const product = value as Record<string, unknown>;
      return { ...product, published: typeof product.published === 'boolean' ? product.published : true };
    });
    if (!migrated.every(validProduct)) {
      throw new Error('Arquivo persistido do catálogo inválido; inicialização recusada.');
    }
    const ids = new Set<string>();
    for (const product of migrated as CatalogInfo[]) {
      if (ids.has(product.id)) throw new Error('Catálogo persistido contém IDs duplicados.');
      ids.add(product.id);
    }
    this.products = (migrated as CatalogInfo[]).map((product) => ({ ...product }));
    if (needsMigration) this.persist();
  }

  private persist(): void {
    mkdirSync(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    const temporary = this.filePath + '.' + process.pid + '.tmp';
    writeFileSync(temporary, JSON.stringify(this.products, null, 2) + '\n', { mode: 0o600 });
    renameSync(temporary, this.filePath);
  }

  list(): CatalogInfo[] {
    return this.products.map((product) => ({ ...product }));
  }

  find(id: string): CatalogInfo | undefined {
    const product = this.products.find((item) => item.id === id);
    return product ? { ...product } : undefined;
  }

  create(value: unknown): CatalogInfo | null {
    const input = normalizeInput(value);
    if (!input || this.products.length >= 5000) return null;
    const product: CatalogInfo = { id: 'prod-' + randomUUID().replace(/-/g, '').slice(0, 16), ...input, disponivel: 0 };
    this.products.push(product);
    try { this.persist(); } catch { this.products.pop(); return null; }
    return { ...product };
  }

  update(id: string, value: unknown): CatalogInfo | null {
    const index = this.products.findIndex((item) => item.id === id);
    const input = normalizeInput(value);
    if (index < 0 || !input) return null;
    const previous = this.products[index];
    this.products[index] = { id, ...input, disponivel: previous.disponivel };
    try { this.persist(); } catch { this.products[index] = previous; return null; }
    return { ...this.products[index] };
  }

  remove(id: string): boolean {
    const index = this.products.findIndex((item) => item.id === id);
    if (index < 0) return false;
    const [removed] = this.products.splice(index, 1);
    try { this.persist(); } catch { this.products.splice(index, 0, removed); return false; }
    return true;
  }
}
