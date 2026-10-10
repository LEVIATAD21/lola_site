import { ALL_PRODUCTS } from '../data/mockData';

export interface CatalogInfo {
  id: string;
  name: string;
  category: string;
  price: number;
  material: string;
  color: string;
  disponivel: number;
  desc: string;
  image: string;
}

export const CATALOG_INFO: CatalogInfo[] = ALL_PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  category: product.category,
  price: product.price,
  material: product.material ?? 'Não informado',
  color: product.color ?? 'Não informado',
  // InventoryStore supplies the authoritative quantity per request.
  disponivel: 0,
  desc: product.description,
  image: product.image,
}));
