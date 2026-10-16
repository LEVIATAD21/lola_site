import React from 'react';
import { X, MessageCircle, ExternalLink, ShieldCheck } from 'lucide-react';
import { Product } from '../../data/mockData';
import { useDialogA11y } from '../../hooks/useDialogA11y';

interface WhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  product?: Product | null;
  selectedSize?: string;
}

export const WhatsAppModal: React.FC<WhatsAppModalProps> = ({
  isOpen,
  onClose,
  product,
  selectedSize = 'P (1,5 cm)',
}) => {
  const { dialogProps, backdropProps, titleId } = useDialogA11y({ isOpen, onClose });

  if (!isOpen) return null;

  const productName = product?.name || 'Acessórios Lola';
  const productPrice = product?.price
    ? `R$ ${product.price.toFixed(2).replace('.', ',')}`
    : 'R$ 49,90';

  const messageText = `Olá, equipe Lola! Tenho interesse no *${productName}* (${selectedSize}) no valor de ${productPrice}. Poderiam me confirmar a disponibilidade e condições de envio?`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(messageText)}`;

  return (
    <div {...dialogProps} className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        {...backdropProps}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in"
      />

      <div className="min-h-full flex items-center justify-center p-4 text-center sm:p-0">
        <div className="relative bg-white rounded-3xl max-w-md w-full text-left overflow-hidden shadow-2xl border border-[#E7DED3] my-8 animate-in zoom-in-95 duration-200">
          
          {/* Header */}
          <div className="p-5 border-b border-[#E7DED3] flex items-center justify-between bg-[#128C7E] text-white">
            <div className="flex items-center gap-2.5">
              <MessageCircle className="w-5 h-5 fill-white text-[#128C7E]" />
              <h3 id={titleId} className="font-semibold text-base">
                Comprar pelo WhatsApp
              </h3>
            </div>
            <button
              onClick={onClose}
              aria-label="Fechar modal"
              className="p-1 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-4">
            
            <p className="text-xs text-[#766D64] leading-relaxed">
              Você será direcionada para conversar diretamente com o time de atendimento da LOLA com a sua mensagem pronta:
            </p>

            {/* WhatsApp simulated bubble */}
            <div className="p-4 bg-[#DCF8C6] rounded-2xl rounded-tr-xs border border-[#C0ECC0] text-xs text-[#241F1B] leading-relaxed shadow-xs">
              <p className="whitespace-pre-wrap font-sans">{messageText}</p>
              <span className="block text-[10px] text-[#766D64] text-right mt-1.5">Agora</span>
            </div>

            <div className="pt-2">
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Iniciar conversa no WhatsApp (abre em nova aba)"
                className="w-full py-3.5 px-4 rounded-xl bg-[#25D366] hover:bg-[#1EBE5D] text-white font-semibold text-xs sm:text-sm tracking-wide transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer"
              >
                <MessageCircle className="w-4 h-4 fill-white" />
                <span>Iniciar conversa no WhatsApp</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            <div className="p-3 bg-[#F8F4ED] rounded-xl border border-[#E7DED3] text-[11px] text-[#766D64] flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-[#C49A5A] shrink-0 mt-0.5" />
              <p>
                <strong>Nota do protótipo:</strong> O número oficial de atendimento será integrado diretamente pela responsável antes da publicação definitiva.
              </p>
            </div>

          </div>

          {/* Footer */}
          <div className="p-4 bg-[#F8F4ED] border-t border-[#E7DED3] flex justify-end">
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-full bg-[#2A211B] hover:bg-[#C49A5A] text-white text-xs font-medium transition-colors cursor-pointer"
            >
              Fechar
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};
