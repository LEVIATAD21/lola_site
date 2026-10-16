import React, { useRef } from 'react';
import { Trash2, X } from 'lucide-react';
import { useDialogA11y } from '../../hooks/useDialogA11y';

interface ClearCartModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const ClearCartModal: React.FC<ClearCartModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
}) => {
  // Confirmação destrutiva: `alertdialog` e foco inicial em "Cancelar" — o
  // primeiro Tab nunca pode cair em "Sim, limpar".
  const cancelRef = useRef<HTMLButtonElement>(null);
  const { dialogProps, backdropProps, titleId } = useDialogA11y({
    isOpen,
    onClose,
    role: 'alertdialog',
    initialFocusRef: cancelRef,
  });

  if (!isOpen) return null;

  return (
    <div
      {...dialogProps}
      aria-describedby={`${titleId}-desc`}
      className="fixed inset-0 z-50 overflow-y-auto"
    >
      {/* Backdrop */}
      <div
        {...backdropProps}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in"
      />

      <div className="min-h-full flex items-center justify-center p-4 text-center sm:p-0">
        <div className="relative bg-white rounded-3xl max-w-sm w-full text-left overflow-hidden shadow-2xl border border-[#E7DED3] my-8 animate-in zoom-in-95 duration-200 p-6 space-y-4">
          
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-red-600">
              <Trash2 className="w-5 h-5" />
            </div>
            <button
              onClick={onClose}
              aria-label="Fechar"
              className="p-1 rounded-full text-[#766D64] hover:text-[#2A211B] hover:bg-black/5 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-1.5">
            <h3 id={titleId} className="font-serif-brand text-lg font-semibold text-[#241F1B]">
              Limpar sacola?
            </h3>
            <p id={`${titleId}-desc`} className="text-xs text-[#766D64] leading-relaxed">
              Tem certeza que deseja remover todos os itens da sua sacola de compras? Esta ação não pode ser desfeita.
            </p>
          </div>

          <div className="flex items-center gap-2.5 pt-2">
            <button
              ref={cancelRef}
              onClick={onClose}
              className="flex-1 py-2.5 px-4 rounded-xl border border-[#E7DED3] text-xs font-semibold text-[#241F1B] hover:bg-[#F8F4ED] transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className="flex-1 py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-colors cursor-pointer shadow-xs"
            >
              Sim, limpar
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};
