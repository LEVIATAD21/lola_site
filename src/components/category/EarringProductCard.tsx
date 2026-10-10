import React, { useState, useEffect } from 'react';
import { Heart, Star, ShoppingBag } from 'lucide-react';
import { Product } from '../../data/mockData';
import { BadgeEstoque } from '../BadgeEstoque';
import { getProductStock } from '../../services/api';

interface EarringProductCardProps {
  product: Product;
  isFavorite: boolean;
  onToggleFavorite: (product: Product) => void;
  onAddToCart: (product: Product) => void;
  onSelectProduct: (product: Product) => void;
  viewMode?: 'grid' | 'list';
  availableUnits?: number | null;
}

export const EarringProductCard: React.FC<EarringProductCardProps> = ({
  product,
  isFavorite,
  onToggleFavorite,
  onAddToCart,
  onSelectProduct,
  viewMode = 'grid',
  availableUnits: propAvailableUnits,
}) => {
  const [stockUnits, setStockUnits] = useState<number | null | undefined>(propAvailableUnits);

  useEffect(() => {
    if (propAvailableUnits !== undefined) {
      setStockUnits(propAvailableUnits);
      return;
    }
    let isMounted = true;
    getProductStock(product.id).then((res) => {
      if (isMounted) {
        setStockUnits(res ? res.disponivel : null);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [product.id, propAvailableUnits]);

  const hasConfirmedStock = typeof stockUnits === 'number';
  const isOutOfStock = hasConfirmedStock && stockUnits <= 0;
  const isStockUnknown = !hasConfirmedStock;
  const canPurchase = hasConfirmedStock && stockUnits > 0;

  const handleAdd = () => {
    if (!canPurchase) return;
    onAddToCart(product);
  };
  if (viewMode === 'list') {
    return (
      <div className="bg-white rounded-2xl overflow-hidden border border-[#E7DED3] hover:border-[#C49A5A]/50 shadow-xs hover:shadow-md transition-all duration-300 p-4 flex flex-col sm:flex-row gap-5 items-center group">
        {/* Image */}
        <div className="relative w-full sm:w-44 aspect-square bg-[#F1E8DC] rounded-xl overflow-hidden shrink-0">
          {product.badge && (
            <span className="absolute top-2.5 left-2.5 z-10 px-2 py-0.5 rounded-full bg-[#2A211B] text-white text-[10px] font-semibold tracking-wide">
              {product.badge}
            </span>
          )}
          <button
            onClick={() => onSelectProduct(product)}
            className="w-full h-full block focus:outline-none cursor-pointer"
            aria-label={`Ver detalhes de ${product.name}`}
          >
            <img
              src={product.image}
              alt={product.name}
              className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
              loading="lazy"
            />
          </button>
          <button
            onClick={() => onToggleFavorite(product)}
            aria-label={isFavorite ? `Remover ${product.name} dos favoritos` : `Adicionar ${product.name} aos favoritos`}
            className="absolute top-2.5 right-2.5 p-1.5 rounded-full bg-white/90 hover:bg-white text-[#766D64] hover:text-[#2A211B] shadow-xs cursor-pointer z-10"
          >
            <Heart
              className={`w-4 h-4 ${
                isFavorite ? 'fill-[#C49A5A] text-[#C49A5A]' : 'text-[#766D64]'
              }`}
            />
          </button>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 space-y-2 text-left w-full">
          <div className="flex items-center gap-1.5">
            <div className="flex items-center text-[#C49A5A]" title="Avaliação ilustrativa do catálogo">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-3 h-3 fill-[#C49A5A]" />
              ))}
            </div>
          </div>

          <h3
            onClick={() => onSelectProduct(product)}
            className="font-medium text-base text-[#241F1B] hover:text-[#C49A5A] transition-colors cursor-pointer"
          >
            {product.name}
          </h3>

          <p className="text-xs text-[#766D64] line-clamp-2 leading-relaxed">
            {product.description}
          </p>

          <div className="flex items-baseline justify-between pt-1">
            <span className="font-semibold text-lg text-[#241F1B] tabular-nums">
              R$ {product.price.toFixed(2).replace('.', ',')}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[#766D64]">
                {product.color} • {product.material}
              </span>
              <BadgeEstoque availableUnits={stockUnits} showDetailed={false} />
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="w-full sm:w-auto shrink-0 pt-2 sm:pt-0">
          <button
            onClick={handleAdd}
            disabled={!canPurchase}
            className={`w-full sm:w-auto px-6 py-3 rounded-xl text-xs font-semibold uppercase tracking-wider transition-colors flex items-center justify-center gap-2 ${
              !canPurchase
                ? 'bg-stone-200 text-stone-500 cursor-not-allowed border border-stone-300 shadow-none'
                : 'bg-[#2A211B] hover:bg-[#C49A5A] text-white cursor-pointer shadow-sm'
            }`}
            title={
              !canPurchase
                ? isOutOfStock
                  ? 'Produto esgotado'
                  : 'Disponibilidade sob consulta — estoque não confirmado'
                : undefined
            }
          >
            {isOutOfStock ? (
              <span>Esgotado</span>
            ) : isStockUnknown ? (
              <span>Consulte disponibilidade</span>
            ) : (
              <>
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>Adicionar à sacola</span>
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  // Grid Mode (matching Design 02 Reference screenshot)
  return (
    <div className="bg-white rounded-2xl overflow-hidden border border-[#E7DED3] hover:border-[#C49A5A]/50 shadow-xs hover:shadow-md transition-all duration-300 flex flex-col group text-left">
      
      {/* Image Container with Badges and Favorite Button */}
      <div className="relative aspect-square bg-[#F1E8DC] overflow-hidden">
        
        {/* Badge on top left if available */}
        {product.badge && (
          <span className="absolute top-3 left-3 z-10 px-2.5 py-0.5 rounded-full bg-[#2A211B] text-white text-[10px] font-semibold tracking-wide shadow-xs">
            {product.badge}
          </span>
        )}

        {/* Product image with click trigger */}
        <button
          onClick={() => onSelectProduct(product)}
          className="w-full h-full block focus:outline-none cursor-pointer"
          aria-label={`Ver detalhes de ${product.name}`}
        >
          <img
            src={product.image}
            alt={product.name}
            className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            loading="lazy"
          />
        </button>

        {/* Favorite Heart Button top right */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(product);
          }}
          aria-label={isFavorite ? `Remover ${product.name} dos favoritos` : `Adicionar ${product.name} aos favoritos`}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 hover:bg-white backdrop-blur-xs flex items-center justify-center text-[#2A211B] transition-transform duration-200 hover:scale-110 shadow-xs cursor-pointer z-10"
        >
          <Heart
            className={`w-4 h-4 transition-colors ${
              isFavorite ? 'fill-[#C49A5A] text-[#C49A5A]' : 'text-[#766D64] hover:text-[#2A211B]'
            }`}
          />
        </button>
      </div>

      {/* Product Content Details */}
      <div className="p-4 flex flex-col flex-1 justify-between gap-3 bg-white">
        
        <div className="space-y-1.5">
          {/* Title */}
          <h3
            onClick={() => onSelectProduct(product)}
            className="font-medium text-xs sm:text-sm text-[#241F1B] hover:text-[#C49A5A] transition-colors line-clamp-1 cursor-pointer"
            title={product.name}
          >
            {product.name}
          </h3>

          {/* Rating stars matching reference */}
          <div className="flex items-center gap-1.5" title="Demonstração visual do catálogo">
            <div className="flex items-center text-[#C49A5A]">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-3 h-3 fill-[#C49A5A]" />
              ))}
            </div>
          </div>

          {/* Price and Stock Badge */}
          <div className="flex items-center justify-between pt-0.5">
            <p className="font-semibold text-sm sm:text-base text-[#241F1B] tabular-nums">
              R$ {product.price.toFixed(2).replace('.', ',')}
            </p>
            <BadgeEstoque availableUnits={stockUnits} showDetailed={false} />
          </div>
        </div>

        {/* Button: Adicionar à sacola (matching Design 02 dark button) */}
        <button
          onClick={handleAdd}
          disabled={!canPurchase}
          className={`w-full py-2.5 px-3 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-1.5 ${
            !canPurchase
              ? 'bg-stone-200 text-stone-500 cursor-not-allowed border border-stone-300 shadow-none'
              : 'bg-[#2A211B] hover:bg-[#C49A5A] text-white cursor-pointer shadow-xs active:scale-[0.98]'
          }`}
          title={
            !canPurchase
              ? isOutOfStock
                ? 'Produto esgotado'
                : 'Disponibilidade sob consulta — estoque não confirmado'
              : undefined
          }
        >
          {isOutOfStock ? (
            <span>Esgotado</span>
          ) : isStockUnknown ? (
            <span>Consulte disponibilidade</span>
          ) : (
            <>
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Adicionar à sacola</span>
            </>
          )}
        </button>

      </div>

    </div>
  );
};
