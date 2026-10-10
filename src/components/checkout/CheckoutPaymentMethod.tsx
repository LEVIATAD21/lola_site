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
  onOpenInfo?: (title: string, content: string) => void;
}

export const CheckoutPaymentMethod: React.FC<CheckoutPaymentMethodProps> = ({
  paymentData,
  onChange,
  totalAmount,
  onBackToCart,
  onSubmitOrder,
  isSubmitting = false,
  termsError = false,
  onOpenInfo,
}) => {
  const update = (field: keyof PaymentData, val: any) => {
    onChange({ ...paymentData, [field]: val });
  };

  const optionClass = (method: PaymentType) =>
    `p-4 rounded-2xl border transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C49A5A] ${
      paymentData.method === method
        ? 'border-[#2A211B] bg-[#F8F4ED]/50 ring-1 ring-[#2A211B]'
        : 'border-[#E7DED3] hover:border-[#C49A5A]/50 bg-white'
    }`;

  const radioIndicator = (method: PaymentType) => (
    <div
      className={`w-4 h-4 rounded-full border flex items-center justify-center ${
        paymentData.method === method ? 'border-[#2A211B] bg-[#2A211B]' : 'border-[#766D64]'
      }`}
    >
      {paymentData.method === method && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
    </div>
  );

  const selectMethod = (method: PaymentType) => update('method', method);

  const methodKeyDown = (method: PaymentType) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      selectMethod(method);
    }
  };

  const openPolicy = (title: string, content: string) => {
    if (onOpenInfo) onOpenInfo(title, content);
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
      <div role="radiogroup" aria-label="Forma de pagamento" className="space-y-3">

        {/* 1. Cartão de Crédito */}
        <div
          role="radio"
          aria-checked={paymentData.method === 'credit_card'}
          tabIndex={0}
          onClick={() => selectMethod('credit_card')}
          onKeyDown={methodKeyDown('credit_card')}
          className={optionClass('credit_card')}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {radioIndicator('credit_card')}
              <CreditCard className="w-5 h-5 text-[#2A211B]" />
              <div>
                <p className="text-xs sm:text-sm font-semibold text-[#241F1B]">Cartão de crédito</p>
                <p className="text-[11px] text-[#766D64]">Parcelamento definido pelo provedor de pagamento</p>
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
            <p className="mb-3 rounded-xl border border-[#E7DED3] bg-[#F8F4ED] p-3 text-[11px] leading-relaxed text-[#766D64]">Modo de demonstração: não informe dados reais do cartão. Os campos abaixo não são enviados ao servidor e nenhuma cobrança será realizada.</p>
              <div className="mt-4 pt-4 border-t border-[#E7DED3] space-y-3.5 animate-in fade-in text-xs">
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-800 leading-relaxed">
                Demonstração: informe apenas dados de teste. Esta tela não envia informações a nenhum processador de pagamento.
              </div>

              <div>
                <label className="font-semibold text-[#241F1B] block mb-1">
                  Número do cartão
                </label>
                <input
                  type="text"
                  placeholder="0000 0000 0000 0000"
                  maxLength={19}
                  autoComplete="off"
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
                  autoComplete="off"
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
                    autoComplete="off"
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
                    autoComplete="off"
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
                        {parc}x de R$ {parcVal} (estimativa — sem juros nesta simulação)
                      </option>
                    );
                  })}
                </select>
                <p className="text-[10px] text-[#766D64] mt-1">
                  Condições reais de parcelamento e juros serão exibidas pelo provedor de pagamento na integração.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 2. PIX */}
        <div
          role="radio"
          aria-checked={paymentData.method === 'pix'}
          tabIndex={0}
          onClick={() => selectMethod('pix')}
          onKeyDown={methodKeyDown('pix')}
          className={optionClass('pix')}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {radioIndicator('pix')}
              <QrCode className="w-5 h-5 text-[#32BCAD]" />
              <div>
                <p className="text-xs sm:text-sm font-semibold text-[#241F1B]">PIX</p>
                <p className="text-[11px] text-[#766D64]">Pagamento online</p>
              </div>
            </div>

            <span className="text-[10px] font-bold text-[#766D64] bg-[#F8F4ED] px-2 py-0.5 rounded-full border border-[#E7DED3]">
              Demonstração
            </span>
          </div>

          {paymentData.method === 'pix' && (
            <div className="mt-4 pt-4 border-t border-[#E7DED3] space-y-3 animate-in fade-in text-xs text-[#766D64]">
              <p>
                Nenhum desconto adicional é aplicado automaticamente nesta demonstração. O código Pix oficial e o QR Code dinâmico serão gerados pela integração com a instituição financeira no backend.
              </p>
              <div className="p-3 bg-white rounded-xl border border-[#E7DED3] flex items-center justify-between text-[11px] text-[#766D64]">
                <span>Ambiente de demonstração do front-end • Chave em configuração</span>
              </div>
            </div>
          )}
        </div>

        {/* 3. Boleto Bancário */}
        <div
          role="radio"
          aria-checked={paymentData.method === 'boleto'}
          tabIndex={0}
          onClick={() => selectMethod('boleto')}
          onKeyDown={methodKeyDown('boleto')}
          className={optionClass('boleto')}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {radioIndicator('boleto')}
              <Barcode className="w-5 h-5 text-[#2A211B]" />
              <div>
                <p className="text-xs sm:text-sm font-semibold text-[#241F1B]">Boleto bancário</p>
                <p className="text-[11px] text-[#766D64]">Emissão na integração com o banco</p>
              </div>
            </div>

            <span className="text-[10px] text-[#766D64] bg-[#F8F4ED] px-2 py-0.5 rounded-full border border-[#E7DED3]">
              Demonstração
            </span>
          </div>

          {paymentData.method === 'boleto' && (
            <div className="mt-4 pt-4 border-t border-[#E7DED3] text-xs text-[#766D64] animate-in fade-in">
              Nenhum boleto é gerado nesta demonstração. A emissão, o vencimento e as regras de compensação serão habilitados na integração com o backend.
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
            <button
              type="button"
              onClick={() =>
                openPolicy(
                  'Termos de uso',
                  'O acesso e uso deste catálogo online pressupõem a aceitação dos termos de compra e política comercial da loja. Nesta demonstração, nenhum pedido ou cobrança é realizado. A versão final dos termos será divulgada antes do lançamento.'
                )
              }
              className="text-[#241F1B] underline font-semibold hover:text-[#C49A5A] cursor-pointer"
            >
              termos de uso
            </button>
            ,{' '}
            <button
              type="button"
              onClick={() =>
                openPolicy(
                  'Política de privacidade',
                  'Nome, telefone e endereço são enviados ao backend para registrar a solicitação de pré-pedido e ficam cifrados no armazenamento do servidor. Nenhum número de cartão, CVV ou validade é enviado ou guardado. Esta versão não processa pagamento nem reserva estoque; a política completa de privacidade deve ser publicada antes do lançamento.'
                )
              }
              className="text-[#241F1B] underline font-semibold hover:text-[#C49A5A] cursor-pointer"
            >
              políticas de privacidade
            </button>{' '}
            e{' '}
            <button
              type="button"
              onClick={() =>
                openPolicy(
                  'Trocas e devoluções',
                  'Você tem 7 dias corridos a partir do recebimento para exercer o direito de arrependimento, conforme o Código de Defesa do Consumidor. Condições de troca e garantia serão confirmadas pela loja no atendimento antes da compra.'
                )
              }
              className="text-[#241F1B] underline font-semibold hover:text-[#C49A5A] cursor-pointer"
            >
              políticas de troca e devolução
            </button>
            .
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
