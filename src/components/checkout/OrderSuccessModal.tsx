import React from 'react';
import { CheckCircle2, Package, ArrowRight, User } from 'lucide-react';

interface OrderSuccessModalProps {
  isOpen: boolean;
  orderNumber: string;
  totalAmount: number;
  paymentMethod: string;
  onGoToAccount: () => void;
  onContinueShopping: () => void;
}

export const OrderSuccessModal: React.FC<OrderSuccessModalProps> = ({
  isOpen,
  orderNumber,
  totalAmount,
  paymentMethod,
  onGoToAccount,
  onContinueShopping,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in" />

      <div className="min-h-full flex items-center justify-center p-4 text-center sm:p-0">
        <div className="relative bg-white rounded-3xl max-w-lg w-full text-left overflow-hidden shadow-2xl border border-[#E7DED3] my-8 animate-in zoom-in-95 duration-200 p-8 space-y-6">
          
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-[#C49A5A] uppercase tracking-widest">
                PEDIDO CONFIRMADO
              </span>
              <h3 className="font-serif-brand text-2xl sm:text-3xl font-semibold text-[#241F1B]">
                Pedido {orderNumber} Realizado!
              </h3>
              <p className="text-xs sm:text-sm text-[#766D64] max-w-sm">
                Enviamos a confirmação com o código de rastreamento para o seu e-mail e WhatsApp.
              </p>
            </div>
          </div>

          <div className="p-4 bg-[#F8F4ED] rounded-2xl border border-[#E7DED3] space-y-2 text-xs text-[#241F1B]">
            <div className="flex justify-between">
              <span className="text-[#766D64]">Total do pedido:</span>
              <span className="font-bold text-sm">R$ {totalAmount.toFixed(2).replace('.', ',')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#766D64]">Forma de pagamento:</span>
              <span className="font-medium capitalize">{paymentMethod === 'credit_card' ? 'Cartão de crédito' : paymentMethod.toUpperCase()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#766D64]">Previsão de entrega:</span>
              <span className="font-medium text-emerald-700">3 a 5 dias úteis</span>
            </div>
          </div>

          <div className="space-y-2.5 pt-2">
            <button
              onClick={onGoToAccount}
              className="w-full py-3.5 px-4 rounded-xl bg-[#2A211B] hover:bg-[#C49A5A] text-white text-xs font-semibold tracking-wider uppercase transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-md"
            >
              <User className="w-4 h-4" />
              <span>Ver Pedido em Minha Conta</span>
            </button>

            <button
              onClick={onContinueShopping}
              className="w-full py-3 px-4 rounded-xl border border-[#E7DED3] text-[#241F1B] hover:bg-[#F8F4ED] text-xs font-semibold tracking-wider transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Package className="w-4 h-4 text-[#766D64]" />
              <span>Continuar Comprando</span>
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};
