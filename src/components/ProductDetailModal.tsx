import React, { useState, useEffect } from 'react';
import { X, Heart, ShoppingBag, ShieldCheck, Sparkles, Check } from 'lucide-react';
import { Product } from '../data/mockData';
import { BadgeEstoque } from './BadgeEstoque';
import { getProductStock } from '../services/api';

interface ProductDetailModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  isFavorite: boolean;
  onToggleFavorite: (product: Product) => void;
  onAddToCart: (product: Product, quantity: number) => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  isOpen,
  onClose,
  isFavorite,
  onToggleFavorite,
  onAddToCart,
}) => {
  const [quantity, setQuantity] = useState(1);
  const [addedSuccess, setAddedSuccess] = useState(false);
  const [stockUnits, setStockUnits] = useState<number | null>(null);

  useEffect(() => {
    if (!product) return;
    let isMounted = true;
    getProductStock(product.id).then((res) => {
      if (isMounted) setStockUnits(res ? res.disponivel : null);
    });
    return () => {
      isMounted = false;
    };
  }, [product]);

  if (!isOpen || !product) return null;

  const hasConfirmedStock = typeof stockUnits === 'number';
  const isOutOfStock = hasConfirmedStock && stockUnits <= 0;
  const isStockUnknown = !hasConfirmedStock;
  const canPurchase = hasConfirmedStock && stockUnits > 0;
  const maxQuantity = canPurchase ? stockUnits : 0;

  const handleAdd = () => {
    if (!canPurchase || quantity <= 0 || quantity > (stockUnits ?? 0)) return;
    onAddToCart(product, quantity);
    setAddedSuccess(true);
    setTimeout(() => setAddedSuccess(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in"
      />

      <div className="min-h-full flex items-center justify-center p-4 text-center sm:p-0">
        <div className="relative bg-white rounded-2xl max-w-2xl w-full text-left overflow-hidden shadow-2xl border border-[#E7DED3] my-8 animate-in zoom-in-95 duration-200">
          
          {/* Close button */}
          <button
            onClick={onClose}
            aria-label="Fechar detalhes"
            className="absolute top-4 right-4 z-20 p-2 rounded-full bg-white/80 hover:bg-white text-[#766D64] hover:text-[#2A211B] shadow-sm transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="grid grid-cols-1 md:grid-cols-2">
            
            {/* Image Box */}
            <div className="relative aspect-square md:aspect-auto bg-[#F1E8DC] overflow-hidden flex items-center justify-center">
              <img
                src={product.image}
                alt={product.name}
                className="w-full h-full object-cover"
              />
              <button
                onClick={() => onToggleFavorite(product)}
                aria-label={isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                className="absolute top-4 left-4 p-2.5 rounded-full bg-white/90 hover:bg-white shadow-sm transition-transform hover:scale-110 cursor-pointer"
              >
                <Heart
                  className={`w-4 h-4 ${
                    isFavorite ? 'fill-[#C49A5A] text-[#C49A5A]' : 'text-[#766D64]'
                  }`}
                />
              </button>
            </div>

            {/* Content Box */}
            <div className="p-6 sm:p-8 flex flex-col justify-between space-y-6">
              <div className="space-y-3">
                <span className="text-xs font-semibold tracking-wider uppercase text-[#C49A5A]">
                  {product.category}
                </span>

                <h2 className="font-serif-brand text-2xl font-normal text-[#241F1B] leading-snug">
                  {product.name}
                </h2>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-2xl text-[#241F1B] tabular-nums">
                      R$ {product.price.toFixed(2).replace('.', ',')}
                    </span>
                    <span className="text-xs text-[#766D64]">
                      ou 3x de R$ {(product.price / 3).toFixed(2).replace('.', ',')} sem juros
                    </span>
                  </div>
                  <BadgeEstoque availableUnits={stockUnits} />
                </div>

                <p className="text-xs sm:text-sm text-[#766D64] leading-relaxed pt-2">
                  {product.description}
                </p>

                {/* Highlights */}
                <div className="space-y-1.5 pt-2 text-xs text-[#241F1B]">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-[#C49A5A]" />
                    <span>Aço inoxidável cirúrgico premium</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#C49A5A]" />
                    <span>Hipoalergênico e resistente ao contato com a água</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-3 pt-4 border-t border-[#E7DED3]">
                <div className="flex items-center gap-3">
                  <div className="flex items-center border border-[#E7DED3] rounded-lg">
                    <button
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      disabled={!canPurchase || quantity <= 1}
                      className="px-3 py-2 text-sm text-[#766D64] hover:text-[#2A211B] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      -
                    </button>
                    <span className={`px-2 text-sm font-semibold tabular-nums ${canPurchase ? 'text-[#241F1B]' : 'text-stone-400'}`}>
                      {canPurchase ? quantity : 0}
                    </span>
                    <button
                      onClick={() => setQuantity(Math.min(maxQuantity, quantity + 1))}
                      disabled={!canPurchase || quantity >= maxQuantity}
                      className="px-3 py-2 text-sm text-[#766D64] hover:text-[#2A211B] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      +
                    </button>
                  </div>

                  <button
                    onClick={handleAdd}
                    disabled={!canPurchase}
                    className={`flex-1 py-3 px-4 rounded-lg font-semibold text-xs tracking-wider uppercase transition-all flex items-center justify-center gap-2 ${
                      !canPurchase
                        ? 'bg-stone-200 text-stone-500 cursor-not-allowed border border-stone-300'
                        : addedSuccess
                        ? 'bg-emerald-700 text-white cursor-pointer shadow-md'
                        : 'bg-[#2A211B] hover:bg-[#C49A5A] text-white cursor-pointer shadow-md'
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
                      <span>Produto Indisponível</span>
                    ) : isStockUnknown ? (
                      <span>Consulte disponibilidade</span>
                    ) : addedSuccess ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Adicionado!</span>
                      </>
                    ) : (
                      <>
                        <ShoppingBag className="w-4 h-4" />
                        <span>Adicionar à Sacola</span>
                      </>
                    )}
                  </button>
                </div>

                <p className="text-[11px] text-center text-[#766D64] italic">
                  * Item demonstrativo da prévia de lançamento da coleção.
                </p>
              </div>

            </div>

          </div>

        </div>
      </div>
    </div>
  );
};
