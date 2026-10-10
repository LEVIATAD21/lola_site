import { describe, expect, it } from 'vitest';
import { ALL_PRODUCTS } from '../../data/mockData';
import { CATALOG_INFO } from '../catalog';

describe('catálogo compartilhado entre site e backend', () => {
  it('expõe todos os produtos do catálogo visual sem omissões', () => {
    expect(CATALOG_INFO).toHaveLength(ALL_PRODUCTS.length);
    expect(new Set(CATALOG_INFO.map((product) => product.id)).size).toBe(ALL_PRODUCTS.length);
  });

  it('mantém os IDs, nomes e preços idênticos à fonte do frontend', () => {
    for (const product of ALL_PRODUCTS) {
      const backendProduct = CATALOG_INFO.find((candidate) => candidate.id === product.id);
      expect(backendProduct).toBeDefined();
      expect(backendProduct?.name).toBe(product.name);
      expect(backendProduct?.price).toBe(product.price);
      expect(backendProduct?.desc).toBe(product.description);
      expect(backendProduct?.image).toBe(product.image);
    }
  });

  it('não expõe produtos sem identificador, nome, categoria ou preço válido', () => {
    for (const product of CATALOG_INFO) {
      expect(product.id.trim()).not.toBe('');
      expect(product.name.trim()).not.toBe('');
      expect(product.category.trim()).not.toBe('');
      expect(Number.isFinite(product.price)).toBe(true);
      expect(product.price).toBeGreaterThan(0);
    }
  });

  it('não inventa material ou cor quando esses dados não existem no catálogo', () => {
    const missingAttributes = ALL_PRODUCTS.filter((product) => !product.material || !product.color);
    for (const product of missingAttributes) {
      const backendProduct = CATALOG_INFO.find((candidate) => candidate.id === product.id);
      expect(backendProduct?.material).toBe(product.material ?? 'Não informado');
      expect(backendProduct?.color).toBe(product.color ?? 'Não informado');
    }
  });
});
