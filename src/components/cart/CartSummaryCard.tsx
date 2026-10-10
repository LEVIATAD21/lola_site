import React from 'react';
import { ShoppingBag, MessageCircle, ShieldCheck, Truck, Tag } from 'lucide-react';

interface CartSummaryCardProps {
  totalItemsCount: number;
  subtotal: number;
  shippingPrice: number | null; // null if not calculated yet
  shippingLabel?: string;
  discountAmount: number;
  couponCode?: string | null;
  onOpenShippingModal: () => void;
  onOpenCouponModal: () => void;
  onCheckout: () => void;
  onOpenWhatsApp: () => void;
}

export const CartSummaryCard: React.FC<CartSummaryCardProps> = ({
  totalItemsCount,
  subtotal,
  shippingPrice,
  shippingLabel,
  discountAmount,
  couponCode,
  onOpenShippingModal,
  onOpenCouponModal,
  onCheckout,
  onOpenWhatsApp,
}) => {
  const currentShipping = shippingPrice !== null ? shippingPrice : 0;
  const finalTotal = Math.max(0, subtotal + currentShipping - discountAmount);
  const installmentValue = (finalTotal / 3).toFixed(2).replace('.', ',');

  return (
    <div className="bg-white rounded-3xl p-6 sm:p-7 border border-[#E7DED3] shadow-xs space-y-5 text-left sticky top-28">
      
      {/* Title */}
      <h2 className="font-serif-brand text-xl font-semibold text-[#241F1B]">
        Resumo do pedido
      </h2>

      {/* Breakdown lines */}
      <div className="space-y-3.5 text-xs text-[#241F1B]">
        
        {/* Subtotal */}
        <div className="flex items-center justify-between">
          <span className="text-[#766D64]">
            Subtotal ({totalItemsCount} {totalItemsCount === 1 ? 'item' : 'itens'})
          </span>
          <span className="font-semibold tabular-nums text-sm">
            R$ {subtotal.toFixed(2).replace('.', ',')}
          </span>
        </div>

        {/* Frete */}
        <div className="flex items-center justify-between">
          <span className="text-[#766D64]">Frete</span>
          {shippingPrice !== null ? (
            <button
              onClick={onOpenShippingModal}
              className="font-medium text-xs text-[#2A211B] hover:text-[#C49A5A] flex items-center gap-1.5 cursor-pointer"
            >
              <Truck className="w-3.5 h-3.5 text-[#C49A5A]" />
              <span>
                {shippingPrice === 0 ? (
                  <strong className="text-emerald-700">GRÁTIS</strong>
                ) : (
                  `R$ ${shippingPrice.toFixed(2).replace('.', ',')}`
                )}
              </span>
              <span className="text-[11px] text-[#766D64] underline ml-1">alterar</span>
            </button>
          ) : (
            <button
              onClick={onOpenShippingModal}
              className="font-medium text-xs text-[#2A211B] hover:text-[#C49A5A] flex items-center gap-1.5 cursor-pointer group"
            >
              <Truck className="w-3.5 h-3.5 text-[#766D64] group-hover:text-[#C49A5A]" />
              <span className="underline">Calcular</span>
            </button>
          )}
        </div>

        {/* Cupom de desconto */}
        <div className="flex items-center justify-between">
          <span className="text-[#766D64]">Cupom de desconto</span>
          {couponCode ? (
            <button
              onClick={onOpenCouponModal}
              className="font-medium text-xs text-emerald-700 flex items-center gap-1 cursor-pointer"
            >
              <Tag className="w-3.5 h-3.5" />
              <span>- R$ {discountAmount.toFixed(2).replace('.', ',')} ({couponCode})</span>
            </button>
          ) : (
            <button
              onClick={onOpenCouponModal}
              className="font-medium text-xs text-[#2A211B] hover:text-[#C49A5A] flex items-center gap-1.5 cursor-pointer group"
            >
              <Tag className="w-3.5 h-3.5 text-[#766D64] group-hover:text-[#C49A5A]" />
              <span className="underline">Adicionar</span>
            </button>
          )}
        </div>

      </div>

      {/* Divider */}
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
          ou em até 3x de R$ {installmentValue} sem juros
        </p>
      </div>

      {/* CTAs */}
      <div className="space-y-3 pt-2">
        {/* Finalizar compra */}
        <button
          onClick={onCheckout}
          className="w-full py-4 px-6 rounded-2xl bg-[#2A211B] hover:bg-[#C49A5A] text-white font-semibold text-xs sm:text-sm tracking-wider uppercase transition-all flex items-center justify-center gap-2.5 cursor-pointer shadow-md active:scale-[0.99]"
        >
          <ShoppingBag className="w-4 h-4" />
          <span>Finalizar compra</span>
        </button>

        {/* Comprar pelo WhatsApp */}
        <button
          onClick={onOpenWhatsApp}
          className="w-full py-3.5 px-6 rounded-2xl bg-white hover:bg-[#F8F4ED] text-[#241F1B] border border-[#2A211B] font-semibold text-xs sm:text-sm tracking-wide transition-colors flex items-center justify-center gap-2.5 cursor-pointer"
        >
          <MessageCircle className="w-4 h-4 text-emerald-600" />
          <span>Comprar pelo WhatsApp</span>
        </button>
      </div>

      {/* Security Callout matching Design 04 */}
      <div className="p-3.5 bg-[#F8F4ED] rounded-2xl border border-[#E7DED3] flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-[#2A211B] shrink-0 mt-0.5" />
        <div className="text-[11px] leading-snug">
          <h4 className="font-semibold text-[#241F1B]">Compra segura</h4>
          <p className="text-[#766D64] mt-0.5">
            Seus dados são protegidos e suas compras são 100% seguras.
          </p>
        </div>
      </div>

    </div>
  );
};
