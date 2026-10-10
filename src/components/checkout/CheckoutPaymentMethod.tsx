import React from 'react';
import { CreditCard, QrCode, Barcode, ArrowLeft, ArrowRight } from 'lucide-react';

export type PaymentType = 'credit_card' | 'pix' | 'boleto';

export interface PaymentData {
  method: PaymentType;
  cardNumber: string;
  cardName: string;
  cardExpiry: string;
  cardCvv: string;
  installments: number;
  acceptedTerms: boolean;
}

interface CheckoutPaymentMethodProps {
  paymentData: PaymentData;
  onChange: (data: PaymentData) => void;
  totalAmount: number;
  onBackToCart: () => void;
  onSubmitOrder: () => void;
  isSubmitting?: boolean;
  termsError?: boolean;
}

export const CheckoutPaymentMethod: React.FC<CheckoutPaymentMethodProps> = ({
  paymentData,
  onChange,
  totalAmount,
  onBackToCart,
  onSubmitOrder,
  isSubmitting = false,
  termsError = false,
}) => {
  const update = (field: keyof PaymentData, val: any) => {
    onChange({ ...paymentData, [field]: val });
  };

  return (
    <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#E7DED3] shadow-xs text-left space-y-6">
      
      {/* Title */}
      <div className="space-y-1 pb-2 border-b border-[#E7DED3]">
        <div className="flex items-center gap-2.5">
          <CreditCard className="w-5 h-5 text-[#2A211B]" />
          <h2 className="font-serif-brand text-xl font-semibold text-[#241F1B]">
            2. Pagamento
          </h2>
        </div>
        <p className="text-xs text-[#766D64]">
          Escolha a forma de pagamento que preferir.
        </p>
      </div>

      {/* Payment Options List */}
      <div className="space-y-3">
        
        {/* 1. Cartão de Crédito */}
        <div
          onClick={() => update('method', 'credit_card')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            paymentData.method === 'credit_card'
              ? 'border-[#2A211B] bg-[#F8F4ED]/50 ring-1 ring-[#2A211B]'
              : 'border-[#E7DED3] hover:border-[#C49A5A]/50 bg-white'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                  paymentData.method === 'credit_card' ? 'border-[#2A211B] bg-[#2A211B]' : 'border-[#766D64]'
                }`}
              >
                {paymentData.method === 'credit_card' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
              </div>
              <CreditCard className="w-5 h-5 text-[#2A211B]" />
              <div>
                <p className="text-xs sm:text-sm font-semibold text-[#241F1B]">Cartão de crédito</p>
                <p className="text-[11px] text-[#766D64]">Parcele em até 12x (consulte condições)</p>
              </div>
            </div>

            {/* Badges Visa / Master */}
            <div className="hidden sm:flex items-center gap-1.5 opacity-80">
              <span className="text-[10px] font-black italic text-[#1A1F71] bg-white px-1.5 py-0.5 rounded border border-[#E7DED3]">VISA</span>
              <span className="text-[10px] font-bold text-[#EB001B] bg-white px-1.5 py-0.5 rounded border border-[#E7DED3]">MC</span>
            </div>
          </div>

          {/* Expanded Credit Card Fields */}
          {paymentData.method === 'credit_card' && (
            <div className="mt-4 pt-4 border-t border-[#E7DED3] space-y-3.5 animate-in fade-in text-xs">
              <div>
                <label className="font-semibold text-[#241F1B] block mb-1">
                  Número do cartão
                </label>
                <input
                  type="text"
                  placeholder="0000 0000 0000 0000"
                  maxLength={19}
                  value={paymentData.cardNumber}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '').replace(/(\d{4})/g, '$1 ').trim();
                    update('cardNumber', v);
                  }}
                  className="w-full h-10 px-3 rounded-xl border border-[#E7DED3] text-sm text-[#241F1B] focus:outline-none focus:border-[#C49A5A]"
                />
              </div>

              <div>
                <label className="font-semibold text-[#241F1B] block mb-1">
                  Nome impresso no cartão
                </label>
                <input
                  type="text"
                  placeholder="Nome como está no cartão"
                  value={paymentData.cardName}
                  onChange={(e) => update('cardName', e.target.value.toUpperCase())}
                  className="w-full h-10 px-3 rounded-xl border border-[#E7DED3] text-sm text-[#241F1B] uppercase focus:outline-none focus:border-[#C49A5A]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-[#241F1B] block mb-1">
                    Validade (MM/AA)
                  </label>
                  <input
                    type="text"
                    placeholder="MM/AA"
                    maxLength={5}
                    value={paymentData.cardExpiry}
                    onChange={(e) => {
                      let v = e.target.value.replace(/\D/g, '');
                      if (v.length > 2) v = `${v.slice(0, 2)}/${v.slice(2, 4)}`;
                      update('cardExpiry', v);
                    }}
                    className="w-full h-10 px-3 rounded-xl border border-[#E7DED3] text-sm text-[#241F1B] focus:outline-none focus:border-[#C49A5A]"
                  />
                </div>

                <div>
                  <label className="font-semibold text-[#241F1B] block mb-1">
                    CVV
                  </label>
                  <input
                    type="text"
                    placeholder="123"
                    maxLength={4}
                    value={paymentData.cardCvv}
                    onChange={(e) => update('cardCvv', e.target.value.replace(/\D/g, ''))}
                    className="w-full h-10 px-3 rounded-xl border border-[#E7DED3] text-sm text-[#241F1B] focus:outline-none focus:border-[#C49A5A]"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-[#241F1B] block mb-1">
                  Opções de parcelamento
                </label>
                <select
                  value={paymentData.installments}
                  onChange={(e) => update('installments', Number(e.target.value))}
                  aria-label="Número de parcelas"
                  className="w-full h-10 px-3 rounded-xl border border-[#E7DED3] text-xs text-[#241F1B] bg-white focus:outline-none focus:border-[#C49A5A] cursor-pointer"
                >
                  {[1, 2, 3, 4, 5, 6, 10, 12].map((parc) => {
                    const parcVal = (totalAmount / parc).toFixed(2).replace('.', ',');
                    return (
                      <option key={parc} value={parc}>
                        {parc}x de R$ {parcVal} {parc <= 6 ? 'sem juros' : 'com pequeno acréscimo'}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* 2. PIX */}
        <div
          onClick={() => update('method', 'pix')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            paymentData.method === 'pix'
              ? 'border-[#2A211B] bg-[#F8F4ED]/50 ring-1 ring-[#2A211B]'
              : 'border-[#E7DED3] hover:border-[#C49A5A]/50 bg-white'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                  paymentData.method === 'pix' ? 'border-[#2A211B] bg-[#2A211B]' : 'border-[#766D64]'
                }`}
              >
                {paymentData.method === 'pix' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
              </div>
              <QrCode className="w-5 h-5 text-[#32BCAD]" />
              <div>
                <p className="text-xs sm:text-sm font-semibold text-[#241F1B]">PIX</p>
                <p className="text-[11px] text-[#766D64]">Aprovação imediata</p>
              </div>
            </div>

            <span className="text-[10px] font-bold text-[#32BCAD] bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              5% OFF
            </span>
          </div>

          {paymentData.method === 'pix' && (
            <div className="mt-4 pt-4 border-t border-[#E7DED3] space-y-3 animate-in fade-in text-xs text-[#766D64]">
              <p>
                O código Pix oficial e o QR Code dinâmico serão gerados pela integração com a instituição financeira no backend.
              </p>
              <div className="p-3 bg-white rounded-xl border border-[#E7DED3] flex items-center justify-between text-[11px] text-[#766D64]">
                <span>Ambiente de demonstração do front-end • Chave em configuração</span>
              </div>
            </div>
          )}
        </div>

        {/* 3. Boleto Bancário */}
        <div
          onClick={() => update('method', 'boleto')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            paymentData.method === 'boleto'
              ? 'border-[#2A211B] bg-[#F8F4ED]/50 ring-1 ring-[#2A211B]'
              : 'border-[#E7DED3] hover:border-[#C49A5A]/50 bg-white'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                  paymentData.method === 'boleto' ? 'border-[#2A211B] bg-[#2A211B]' : 'border-[#766D64]'
                }`}
              >
                {paymentData.method === 'boleto' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
              </div>
              <Barcode className="w-5 h-5 text-[#2A211B]" />
              <div>
                <p className="text-xs sm:text-sm font-semibold text-[#241F1B]">Boleto bancário</p>
                <p className="text-[11px] text-[#766D64]">Pague em qualquer banco</p>
              </div>
            </div>

            <span className="text-[10px] text-[#766D64] bg-[#F8F4ED] px-2 py-0.5 rounded-full">
              Até 3 dias úteis
            </span>
          </div>

          {paymentData.method === 'boleto' && (
            <div className="mt-4 pt-4 border-t border-[#E7DED3] text-xs text-[#766D64] animate-in fade-in">
              O boleto será gerado ao concluir o pedido com vencimento em até 3 dias úteis.
            </div>
          )}
        </div>

      </div>

      {/* Checkbox Terms */}
      <div className={`pt-2 p-2.5 rounded-xl transition-colors ${termsError ? 'bg-red-50/80 border border-red-200' : ''}`}>
        <label className="flex items-start gap-2.5 cursor-pointer select-none text-xs text-[#766D64] leading-relaxed">
          <input
            type="checkbox"
            checked={paymentData.acceptedTerms}
            onChange={(e) => update('acceptedTerms', e.target.checked)}
            className="w-4 h-4 accent-[#2A211B] text-[#2A211B] rounded border-[#E7DED3] cursor-pointer mt-0.5 shrink-0"
          />
          <span>
            Li e concordo com os{' '}
            <strong className="text-[#241F1B] underline">termos de uso</strong>,{' '}
            <strong className="text-[#241F1B] underline">políticas de privacidade</strong> e{' '}
            <strong className="text-[#241F1B] underline">políticas de troca e devolução</strong>.
          </span>
        </label>
        {termsError && (
          <p className="text-[11px] font-medium text-red-600 mt-1.5 pl-6">
            Por favor, selecione e concorde com os termos para concluir a compra.
          </p>
        )}
      </div>

      {/* Actions Row */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-[#E7DED3]">
        <button
          type="button"
          onClick={onBackToCart}
          className="flex items-center gap-2 text-xs font-semibold text-[#241F1B] hover:text-[#C49A5A] transition-colors cursor-pointer group"
        >
          <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
          <span>Voltar para o carrinho</span>
        </button>

        <button
          type="button"
          onClick={onSubmitOrder}
          disabled={isSubmitting}
          className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-[#2A211B] hover:bg-[#C49A5A] text-white font-semibold text-xs tracking-wider uppercase transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-[0.98] disabled:opacity-50"
        >
          <span>{isSubmitting ? 'Processando...' : 'Continuar para a confirmação'}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

    </div>
  );
};
