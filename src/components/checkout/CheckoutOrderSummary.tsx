import React, { useState } from 'react';
import { ShoppingBag, MessageCircle, ShieldCheck, ChevronUp, ChevronDown, Trash2, Tag, Gift, Check } from 'lucide-react';
import { CartItem } from '../../types';

interface CheckoutOrderSummaryProps {
  items: CartItem[];
  subtotal: number;
  shippingPrice: number | null;
  discountAmount: number;
  appliedCoupon?: string | null;
  onApplyCoupon: (code: string) => void;
  onRemoveItem: (id: string) => void;
  onFinalizeOrder: () => void;
  onOpenWhatsApp: () => void;
  hasGiftWrap: boolean;
  onToggleGiftWrap: () => void;
}

export const CheckoutOrderSummary: React.FC<CheckoutOrderSummaryProps> = ({
  items,
  subtotal,
  shippingPrice,
  discountAmount,
  appliedCoupon,
  onApplyCoupon,
  onRemoveItem,
  onFinalizeOrder,
  onOpenWhatsApp,
  hasGiftWrap,
  onToggleGiftWrap,
}) => {
  const [isItemsExpanded, setIsItemsExpanded] = useState(true);
  const [couponInput, setCouponInput] = useState('');
  const [couponFeedback, setCouponFeedback] = useState('');

  const giftWrapCost = hasGiftWrap ? 9.90 : 0;
  const currentShipping = shippingPrice !== null ? shippingPrice : 0;
  const finalTotal = Math.max(0, subtotal + currentShipping + giftWrapCost - discountAmount);
  const totalCount = items.reduce((acc, i) => acc + i.quantity, 0);

  const handleApplyCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponInput.trim()) return;
    onApplyCoupon(couponInput.trim().toUpperCase());
    setCouponFeedback(`Cupom ${couponInput.trim().toUpperCase()} aplicado!`);
    setCouponInput('');
    setTimeout(() => setCouponFeedback(''), 3000);
  };

  return (
    <div className="space-y-6 text-left">
      
      {/* 1. Main Order Summary Card */}
      <div className="bg-white rounded-3xl p-6 sm:p-7 border border-[#E7DED3] shadow-xs space-y-5">
        
        {/* Header with items toggle */}
        <div
          onClick={() => setIsItemsExpanded(!isItemsExpanded)}
          className="flex items-center justify-between pb-3 border-b border-[#E7DED3] cursor-pointer select-none"
        >
          <div className="flex items-center gap-2">
            <h3 className="font-serif-brand text-lg font-semibold text-[#241F1B]">
              Resumo do pedido
            </h3>
            <span className="text-xs text-[#766D64]">
              {totalCount} {totalCount === 1 ? 'item' : 'itens'}
            </span>
          </div>

          <button
            type="button"
            className="p-1 text-[#766D64] hover:text-[#2A211B] cursor-pointer"
          >
            {isItemsExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {/* Collapsible Item List */}
        {isItemsExpanded && (
          <div className="space-y-3.5 max-h-72 overflow-y-auto pr-1">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 text-xs pb-3 border-b border-[#E7DED3]/60 last:border-0 last:pb-0"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-12 h-12 rounded-lg object-cover bg-[#F1E8DC] border border-[#E7DED3] shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="font-medium text-[#241F1B] truncate">{item.name}</p>
                    <p className="text-[11px] text-[#766D64]">
                      {item.color || 'Dourado'} • {item.variant || 'Único'}
                    </p>
                    <p className="font-semibold text-[#2A211B] mt-0.5">
                      R$ {item.price.toFixed(2).replace('.', ',')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="w-6 text-center text-xs text-[#766D64] font-semibold">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemoveItem(item.id)}
                    aria-label={`Remover ${item.name}`}
                    className="p-1 text-[#766D64] hover:text-red-600 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Financial Breakdown */}
        <div className="space-y-2.5 text-xs text-[#241F1B] pt-2 border-t border-[#E7DED3]">
          <div className="flex justify-between">
            <span className="text-[#766D64]">Subtotal ({totalCount} itens)</span>
            <span className="font-semibold tabular-nums">
              R$ {subtotal.toFixed(2).replace('.', ',')}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-[#766D64]">Frete</span>
            <span className="font-medium">
              {shippingPrice === null ? (
                'A calcular'
              ) : shippingPrice === 0 ? (
                <strong className="text-emerald-700">GRÁTIS</strong>
              ) : (
                `R$ ${shippingPrice.toFixed(2).replace('.', ',')}`
              )}
            </span>
          </div>

          {hasGiftWrap && (
            <div className="flex justify-between text-xs text-[#2A211B]">
              <span className="text-[#766D64]">Embalagem para presente</span>
              <span className="font-semibold">R$ 9,90</span>
            </div>
          )}

          {discountAmount > 0 && (
            <div className="flex justify-between text-emerald-700 font-semibold">
              <span>Cupom de desconto ({appliedCoupon})</span>
              <span>- R$ {discountAmount.toFixed(2).replace('.', ',')}</span>
            </div>
          )}
        </div>

        {/* Total and Installments */}
        <div className="border-t border-[#E7DED3] pt-4 space-y-1">
          <div className="flex items-baseline justify-between">
            <span className="font-serif-brand text-lg font-semibold text-[#241F1B]">
              Total
            </span>
            <span className="font-semibold text-2xl text-[#241F1B] tabular-nums">
              R$ {finalTotal.toFixed(2).replace('.', ',')}
            </span>
          </div>
          <p className="text-[11px] text-[#766D64] text-right">
            ou em até 12x de R$ {(finalTotal / 12).toFixed(2).replace('.', ',')}
          </p>
        </div>

        {/* Inline Coupon Box matching Design 05 screenshot */}
        <form onSubmit={handleApplyCoupon} className="pt-2 space-y-2">
          <label className="text-[11px] font-semibold text-[#766D64] block">
            Tem um cupom de desconto?
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Digite seu código (ex: LOLA10)"
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value)}
                className="w-full h-10 px-3 pl-8 rounded-xl border border-[#E7DED3] text-xs text-[#241F1B] uppercase tracking-wide focus:outline-none focus:border-[#C49A5A]"
              />
              <Tag className="w-3.5 h-3.5 text-[#766D64] absolute left-2.5 top-3.5" />
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-[#2A211B] hover:bg-[#C49A5A] text-white text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer"
            >
              Aplicar
            </button>
          </div>
          {couponFeedback && (
            <p className="text-[11px] text-emerald-700 font-medium">{couponFeedback}</p>
          )}
        </form>

        {/* Action Buttons */}
        <div className="space-y-2.5 pt-2">
          <button
            type="button"
            onClick={onFinalizeOrder}
            className="w-full py-4 px-6 rounded-2xl bg-[#2A211B] hover:bg-[#C49A5A] text-white font-semibold text-xs sm:text-sm tracking-wider uppercase transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-[0.99]"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Finalizar compra</span>
          </button>

          <button
            type="button"
            onClick={onOpenWhatsApp}
            className="w-full py-3.5 px-6 rounded-2xl bg-white hover:bg-[#F8F4ED] text-[#241F1B] border border-[#2A211B] font-semibold text-xs sm:text-sm tracking-wide transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <MessageCircle className="w-4 h-4 text-emerald-600" />
            <span>Comprar pelo WhatsApp</span>
          </button>
        </div>

        {/* Security Callout */}
        <div className="p-3 bg-[#F8F4ED] rounded-xl border border-[#E7DED3] flex items-center gap-2.5 text-[11px] text-[#766D64]">
          <ShieldCheck className="w-4 h-4 text-[#2A211B] shrink-0" />
          <span>Compra segura • Seus dados são protegidos e suas compras são 100% seguras.</span>
        </div>

      </div>

      {/* 2. Special Promo Box: Presente Especial (matching Design 05 screenshot) */}
      <div className="bg-[#FAF6F0] rounded-3xl p-5 border border-[#E7DED3] flex flex-col sm:flex-row items-center gap-4 text-left shadow-xs overflow-hidden">
        <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden shrink-0 bg-white border border-[#E7DED3]">
          <img
            src="/src/assets/images/lola_gift_box_1791590840477.jpg"
            alt="Embalagem de presente Lola"
            className="w-full h-full object-cover"
          />
        </div>

        <div className="flex-1 space-y-1.5 min-w-0">
          <div className="flex items-center gap-1.5 text-[#2A211B]">
            <Gift className="w-4 h-4 text-[#C49A5A]" />
            <h4 className="font-serif-brand font-semibold text-sm sm:text-base">
              Presente especial
            </h4>
          </div>
          <p className="text-[11px] text-[#766D64] leading-relaxed">
            Embalagem para presente disponível na finalização da compra (+ R$ 9,90).
          </p>

          <div className="pt-1">
            <button
              type="button"
              onClick={onToggleGiftWrap}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer border ${
                hasGiftWrap
                  ? 'bg-emerald-700 text-white border-emerald-700'
                  : 'bg-white hover:bg-[#F1E8DC] text-[#241F1B] border-[#2A211B]'
              }`}
            >
              {hasGiftWrap ? (
                <span className="flex items-center gap-1">
                  <Check className="w-3 h-3" /> Embalagem incluída
                </span>
              ) : (
                'Adicionar embalagem'
              )}
            </button>
          </div>
        </div>
      </div>

    </div>
  );
};
