import React, { useState } from 'react';
import { Tag, X, Check, AlertCircle } from 'lucide-react';
import { checkCoupon, getActiveCouponList, COUPON_CODE_MAX_LENGTH } from '../../data/coupons';
import { parseStoredCart } from '../../utils/cartStorage';

interface CouponModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyCoupon: (code: string, discountPercentage: number) => void;
  appliedCoupon?: string | null;
  /** Subtotal em centavos dos itens da sacola; sem a prop, a sacola persistida é lida aqui. */
  subtotalCents?: number;
}

/**
 * Subtotal da sacola em centavos quando quem abriu o modal não informa.
 *
 * A recusa precisa do valor real: `BEMVINDA` abaixo do mínimo tem que morrer
 * aqui, com o motivo na tela, e não no envio do pedido. Com a sacola ilegível
 * o subtotal é 0 — nenhum desconto sai da tela nesse estado, e recusar é
 * sempre o lado seguro.
 */
function readStoredSubtotalCents(): number {
  try {
    const items = parseStoredCart(localStorage.getItem('lola_cart'));
    const subtotal = items.reduce((acc, item) => acc + item.price * item.quantity, 0);
    return Math.round(subtotal * 100);
  } catch {
    return 0;
  }
}

export const CouponModal: React.FC<CouponModalProps> = ({
  isOpen,
  onClose,
  onApplyCoupon,
  appliedCoupon,
  subtotalCents,
}) => {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const subtotalEmCentavos = subtotalCents ?? readStoredSubtotalCents();
  const cuponsAtivos = getActiveCouponList();
  const appliedVerdict = appliedCoupon
    ? checkCoupon({ code: appliedCoupon, subtotalCents: subtotalEmCentavos })
    : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = code.trim().toUpperCase();

    if (!cleanCode) {
      setError('Por favor, digite um código de cupom.');
      return;
    }

    // Mesma autoridade do servidor, conferida no momento da aplicação: validade
    // e mínimo são recusados aqui, com o motivo real, em vez de um 400 no envio.
    // O teto de usos continua sendo do servidor — só ele tem a contagem de
    // pré-pedidos gravados.
    const verdict = checkCoupon({ code: cleanCode, subtotalCents: subtotalEmCentavos });
    if (verdict.ok) {
      setError('');
      onApplyCoupon(cleanCode, verdict.percentage);
      onClose();
    } else {
      setError(verdict.error);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in"
      />

      <div className="min-h-full flex items-center justify-center p-4 text-center sm:p-0">
        <div className="relative bg-white rounded-3xl max-w-sm w-full text-left overflow-hidden shadow-2xl border border-[#E7DED3] my-8 animate-in zoom-in-95 duration-200 p-6 space-y-4">
          
          <div className="flex items-center justify-between pb-3 border-b border-[#E7DED3]">
            <div className="flex items-center gap-2">
              <Tag className="w-5 h-5 text-[#C49A5A]" />
              <h3 className="font-serif-brand text-lg font-semibold text-[#241F1B]">
                Cupom de Desconto
              </h3>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-full text-[#766D64] hover:text-[#2A211B] hover:bg-black/5 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <label className="block text-xs font-semibold text-[#241F1B]">
              Digite o seu cupom:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Ex: LOLA10"
                value={code}
                maxLength={COUPON_CODE_MAX_LENGTH}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  setError('');
                }}
                className="w-full h-10 px-3.5 rounded-xl border border-[#E7DED3] text-sm text-[#241F1B] uppercase tracking-wider font-semibold focus:outline-none focus:border-[#C49A5A]"
              />
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-[#2A211B] hover:bg-[#C49A5A] text-white text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer"
              >
                Aplicar
              </button>
            </div>

            {error && (
              <div className="flex items-center gap-1.5 text-xs text-red-600 pt-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </form>

          {/* Só anuncia cupom que ainda está dentro da validade */}
          <div className="p-3 bg-[#F8F4ED] rounded-xl border border-[#E7DED3] text-[11px] text-[#766D64] space-y-1">
            <p className="font-semibold text-[#241F1B]">Cupons disponíveis para teste:</p>
            {cuponsAtivos.length > 0 ? (
              cuponsAtivos.map(({ code: couponCode, percentage }) => (
                <p key={couponCode}>
                  • <strong>{couponCode}</strong> — {percentage}% de desconto no pedido
                </p>
              ))
            ) : (
              <p>Nenhum cupom promocional ativo no momento.</p>
            )}
          </div>

          {appliedCoupon && appliedVerdict?.ok && (
            <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 p-2.5 rounded-xl">
              <Check className="w-4 h-4" />
              <span>Cupom <strong>{appliedCoupon}</strong> ativo no momento!</span>
            </div>
          )}

          {appliedCoupon && appliedVerdict && !appliedVerdict.ok && (
            <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 p-2.5 rounded-xl">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>
                Cupom <strong>{appliedCoupon}</strong> não está valendo neste pedido: {appliedVerdict.error}
              </span>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
