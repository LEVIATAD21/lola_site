export interface ToastMessage {
  id: string;
  type: 'success' | 'info' | 'favorite' | 'error';
  title: string;
  description?: string;
}

export interface CartItem {
  id: string;
  productId: string;
  name: string;
  price: number;
  image: string;
  category: string;
  quantity: number;
  variant?: string; // e.g. "Tamanho: M (2,0 cm)" or "18 cm"
  material?: string; // e.g. "Aço inox"
  color?: string; // e.g. "Dourado"
  inStock?: boolean;
}
