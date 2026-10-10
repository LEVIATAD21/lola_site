import React from 'react';
import { X, Heart, ShoppingBag, Trash2, ArrowRight } from 'lucide-react';
import { FEATURED_PRODUCTS, Product } from '../data/mockData';

interface FavoritesModalProps {
  isOpen: boolean;
  onClose: () => void;
  favorites: string[];
  onRemoveFavorite: (product: Product) => void;
  onSelectProduct: (product: Product) => void;
  onAddToCart: (product: Product) => void;
  onExplore: () => void;
}

export const FavoritesModal: React.FC<FavoritesModalProps> = ({
  isOpen,
  onClose,
  favorites,
  onRemoveFavorite,
  onSelectProduct,
  onAddToCart,
  onExplore,
}) => {
  if (!isOpen) return null;

  const favoriteProducts = FEATURED_PRODUCTS.filter((p) => favorites.includes(p.id));

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in"
      />

      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col">
          
          {/* Header */}
          <div className="p-5 border-b border-[#E7DED3] flex items-center justify-between bg-[#F8F4ED]">
            <div className="flex items-center gap-2">
              <Heart className="w-5 h-5 text-[#C49A5A] fill-[#C49A5A]" />
              <h2 className="font-serif-brand text-lg font-semibold text-[#241F1B]">
                Meus Favoritos ({favoriteProducts.length})
              </h2>
            </div>
            <button
              onClick={onClose}
              aria-label="Fechar favoritos"
              className="p-1.5 text-[#766D64] hover:text-[#2A211B] rounded-full hover:bg-black/5 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {favoriteProducts.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-12 px-4 space-y-4">
                <div className="w-16 h-16 rounded-full bg-[#F1E8DC] flex items-center justify-center text-[#766D64]">
                  <Heart className="w-8 h-8 stroke-[1.5]" />
                </div>
                <div>
                  <h3 className="font-medium text-base text-[#241F1B]">Nenhum favorito salvo</h3>
                  <p className="text-xs text-[#766D64] mt-1 max-w-xs">
                    Toque no coração dos produtos que você amar para guardá-los aqui nesta lista especial.
                  </p>
                </div>
                <button
                  onClick={() => {
                    onClose();
                    onExplore();
                  }}
                  className="px-6 py-2.5 rounded-full bg-[#2A211B] text-white text-xs font-semibold hover:bg-[#C49A5A] transition-colors cursor-pointer"
                >
                  Ver Produtos
                </button>
              </div>
            ) : (
              favoriteProducts.map((product) => (
                <div
                  key={product.id}
                  className="flex gap-4 p-3 rounded-xl border border-[#E7DED3] bg-[#F8F4ED]/30"
                >
                  <img
                    src={product.image}
                    alt={product.name}
                    className="w-20 h-20 rounded-lg object-cover bg-white border border-[#E7DED3] cursor-pointer"
                    onClick={() => {
                      onClose();
                      onSelectProduct(product);
                    }}
                  />
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] text-[#766D64] uppercase tracking-wider block">
                        {product.category}
                      </span>
                      <h4
                        onClick={() => {
                          onClose();
                          onSelectProduct(product);
                        }}
                        className="font-medium text-xs sm:text-sm text-[#241F1B] truncate cursor-pointer hover:text-[#C49A5A]"
                      >
                        {product.name}
                      </h4>
                      <p className="font-semibold text-xs text-[#2A211B] mt-0.5">
                        R$ {product.price.toFixed(2).replace('.', ',')}
                      </p>
                    </div>

                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#E7DED3]/50">
                      <button
                        onClick={() => onAddToCart(product)}
                        className="text-xs font-medium text-[#2A211B] hover:text-[#C49A5A] flex items-center gap-1 cursor-pointer"
                      >
                        <ShoppingBag className="w-3.5 h-3.5" />
                        <span>Mover para sacola</span>
                      </button>

                      <button
                        onClick={() => onRemoveFavorite(product)}
                        aria-label={`Remover ${product.name} dos favoritos`}
                        className="text-[#766D64] hover:text-red-600 p-1 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer note */}
          <div className="p-4 bg-[#F8F4ED] border-t border-[#E7DED3] text-center">
            <p className="text-[11px] text-[#766D64]">
              * Os itens favoritados ficam salvos localmente na sua sessão de navegação.
            </p>
          </div>

        </div>
      </div>
    </div>
  );
};
