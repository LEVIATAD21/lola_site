import React from 'react';
import { CheckCircle2, Package, ArrowRight, User, Info } from 'lucide-react';

interface OrderSuccessModalProps {
  isOpen: boolean;
  orderNumber?: string;
  totalAmount: number;
  paymentMethod: string;
  onGoToAccount: () => void;
  onContinueShopping: () => void;
}

export const OrderSuccessModal: React.FC<OrderSuccessModalProps> = ({
  isOpen,
  totalAmount,
  paymentMethod,
  orderNumber,
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
            <div className="w-16 h-16 rounded-full bg-[#F1E8DC] text-[#2A211B] flex items-center justify-center border border-[#E7DED3]">
              <CheckCircle2 className="w-9 h-9 text-[#C49A5A]" />
            </div>

            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-[#C49A5A] uppercase tracking-widest">
                PRÉ-PEDIDO REGISTRADO
              </span>
              <h3 className="font-serif-brand text-2xl sm:text-3xl font-semibold text-[#241F1B]">
                Solicitação registrada
              </h3>
              <p className="text-xs sm:text-sm text-[#766D64] max-w-sm">
                Código {orderNumber || 'indisponível'}. Nenhum pagamento foi processado; esta solicitação não confirma a venda nem reserva as unidades.
              </p>
            </div>
          </div>

          <div className="p-4 bg-[#F8F4ED] rounded-2xl border border-[#E7DED3] space-y-2 text-xs text-[#241F1B]">
            <div className="flex justify-between">
              <span className="text-[#766D64]">Total estimado da solicitação:</span>
              <span className="font-bold text-sm">R$ {totalAmount.toFixed(2).replace('.', ',')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#766D64]">Opção selecionada:</span>
              <span className="font-medium capitalize">{paymentMethod === 'credit_card' ? 'Cartão de crédito' : paymentMethod.toUpperCase()}</span>
            </div>
            <div className="flex items-start gap-1.5 pt-1 text-[11px] text-[#766D64] border-t border-[#E7DED3]/60">
              <Info className="w-3.5 h-3.5 text-[#C49A5A] shrink-0 mt-0.5" />
              <span>A solicitação está guardada de forma cifrada, mas continua pendente: o gateway de pagamento, o frete real e a confirmação final do estoque ainda precisam ser integrados.</span>
            </div>
          </div>

          <div className="space-y-2.5 pt-2">
            <button
              onClick={onContinueShopping}
              className="w-full py-3.5 px-4 rounded-xl bg-[#2A211B] hover:bg-[#C49A5A] text-white text-xs font-semibold tracking-wider uppercase transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-md"
            >
              <Package className="w-4 h-4" />
              <span>Continuar Explorando a Loja</span>
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};
