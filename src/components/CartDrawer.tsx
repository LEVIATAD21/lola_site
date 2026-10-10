import React from 'react';
import { X, ShoppingBag, Plus, Minus, Trash2, ArrowRight, ShieldCheck } from 'lucide-react';
import { CartItem } from '../types';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  onUpdateQuantity: (id: string, delta: number) => void;
  onRemoveItem: (id: string) => void;
  onCheckout: () => void;
  onExplore: () => void;
  onGoToCartPage?: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  items,
  onUpdateQuantity,
  onRemoveItem,
  onCheckout,
  onExplore,
  onGoToCartPage,
}) => {
  if (!isOpen) return null;

  const subtotal = items.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const freeShippingThreshold = 150.0;
  const missingForFreeShipping = Math.max(0, freeShippingThreshold - subtotal);
  const progressPercent = Math.min(100, (subtotal / freeShippingThreshold) * 100);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
      />

      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col">
          
          {/* Header */}
          <div className="p-5 border-b border-[#E7DED3] flex items-center justify-between bg-[#F8F4ED]">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-[#2A211B]" />
              <h2 className="font-serif-brand text-lg font-semibold text-[#241F1B]">
                Sua Sacola ({items.reduce((acc, i) => acc + i.quantity, 0)})
              </h2>
            </div>
            <button
              onClick={onClose}
              aria-label="Fechar sacola"
              className="p-1.5 text-[#766D64] hover:text-[#2A211B] rounded-full hover:bg-black/5 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Free Shipping Bar */}
          <div className="p-4 bg-[#F1E8DC]/60 border-b border-[#E7DED3] text-xs">
            {missingForFreeShipping > 0 ? (
              <p className="text-[#241F1B] mb-1.5">
                Faltam <strong className="text-[#C49A5A]">R$ {missingForFreeShipping.toFixed(2).replace('.', ',')}</strong> para ganhar <strong>Frete Grátis</strong>!
              </p>
            ) : (
              <p className="text-emerald-700 font-semibold mb-1.5 flex items-center gap-1.5">
                <span>🎉 Parabéns! Você ganhou Frete Grátis para todo o Brasil.</span>
              </p>
            )}
            <div className="w-full h-1.5 bg-[#E7DED3] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#C49A5A] rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Items List */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-12 px-4 space-y-4">
                <div className="w-16 h-16 rounded-full bg-[#F1E8DC] flex items-center justify-center text-[#766D64]">
                  <ShoppingBag className="w-8 h-8 stroke-[1.5]" />
                </div>
                <div>
                  <h3 className="font-medium text-base text-[#241F1B]">Sua sacola está vazia</h3>
                  <p className="text-xs text-[#766D64] mt-1 max-w-xs">
                    Explore nossas coleções em aço inox e encontre a peça perfeita para o seu estilo.
                  </p>
                </div>
                <button
                  onClick={() => {
                    onClose();
                    onExplore();
                  }}
                  className="px-6 py-2.5 rounded-full bg-[#2A211B] text-white text-xs font-semibold hover:bg-[#C49A5A] transition-colors cursor-pointer"
                >
                  Explorar Coleção
                </button>
              </div>
            ) : (
              items.map((item) => (
                <div
                  key={item.id}
                  className="flex gap-4 p-3 rounded-xl border border-[#E7DED3] bg-[#F8F4ED]/30"
                >
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-18 h-18 rounded-lg object-cover bg-white border border-[#E7DED3]"
                  />
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] text-[#766D64] uppercase tracking-wider block">
                        {item.category}
                      </span>
                      <h4 className="font-medium text-xs sm:text-sm text-[#241F1B] truncate">
                        {item.name}
                      </h4>
                      <p className="font-semibold text-xs text-[#2A211B] mt-0.5">
                        R$ {item.price.toFixed(2).replace('.', ',')}
                      </p>
                    </div>

                    {/* Quantity controls */}
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#E7DED3]/50">
                      <div className="flex items-center border border-[#E7DED3] rounded-md bg-white">
                        <button
                          onClick={() => onUpdateQuantity(item.id, -1)}
                          aria-label="Diminuir quantidade"
                          className="p-1 text-[#766D64] hover:text-[#2A211B] cursor-pointer"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="px-2 text-xs font-semibold tabular-nums text-[#241F1B]">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => onUpdateQuantity(item.id, 1)}
                          aria-label="Aumentar quantidade"
                          className="p-1 text-[#766D64] hover:text-[#2A211B] cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <button
                        onClick={() => onRemoveItem(item.id)}
                        aria-label="Remover item"
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

          {/* Footer Subtotal & Action */}
          {items.length > 0 && (
            <div className="p-5 border-t border-[#E7DED3] bg-[#F8F4ED] space-y-3">
              <div className="space-y-1.5 text-xs text-[#766D64]">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="font-semibold text-[#241F1B]">
                    R$ {subtotal.toFixed(2).replace('.', ',')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Frete</span>
                  <span className={missingForFreeShipping === 0 ? 'text-emerald-700 font-semibold' : 'text-[#241F1B]'}>
                    {missingForFreeShipping === 0 ? 'GRÁTIS' : 'Calculado no checkout'}
                  </span>
                </div>
                <div className="flex justify-between text-sm font-semibold text-[#241F1B] pt-2 border-t border-[#E7DED3]">
                  <span>Total estimado</span>
                  <span className="text-base text-[#2A211B]">
                    R$ {subtotal.toFixed(2).replace('.', ',')}
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                {onGoToCartPage && (
                  <button
                    onClick={() => {
                      onClose();
                      onGoToCartPage();
                    }}
                    className="flex-1 py-3 px-3 rounded-full border border-[#2A211B] text-[#2A211B] hover:bg-white text-xs font-semibold tracking-wider uppercase transition-colors cursor-pointer text-center"
                  >
                    Ver Sacola
                  </button>
                )}
                <button
                  onClick={onCheckout}
                  className="flex-1 py-3 px-4 rounded-full bg-[#2A211B] hover:bg-[#C49A5A] text-white font-semibold text-xs tracking-wider uppercase transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
                >
                  <span>Finalizar</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center justify-center gap-1.5 text-[11px] text-[#766D64] pt-1">
                <ShieldCheck className="w-3.5 h-3.5 text-[#C49A5A]" />
                <span>Ambiente protegido com criptografia SSL</span>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
