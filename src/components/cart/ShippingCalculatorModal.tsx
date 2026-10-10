import React, { useState } from 'react';
import { Truck, X, Check, MapPin } from 'lucide-react';

export interface ShippingOption {
  id: string;
  name: string;
  time: string;
  price: number;
}

/**
 * Recalcula o preço da modalidade escolhida para o subtotal atual.
 * Mesma regra demonstrativa usada pelo modal — mantém carrinho e checkout coerentes.
 */
export function quoteShipping(optionId: string, subtotal: number): number {
  const isFreeShipping = subtotal >= 150.0;
  switch (optionId) {
    case 'pac':
      return isFreeShipping ? 0 : 19.9;
    case 'sedex':
      return isFreeShipping ? 12.9 : 28.9;
    case 'transportadora':
      return isFreeShipping ? 0 : 22.5;
    default:
      return isFreeShipping ? 0 : 19.9;
  }
}

interface ShippingCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  subtotal: number;
  onSelectShipping: (option: ShippingOption) => void;
  currentShipping?: ShippingOption | null;
}

export const ShippingCalculatorModal: React.FC<ShippingCalculatorModalProps> = ({
  isOpen,
  onClose,
  subtotal,
  onSelectShipping,
  currentShipping,
}) => {
  const [cep, setCep] = useState('');
  const [calculated, setCalculated] = useState(false);
  const [selectedOptionId, setSelectedOptionId] = useState<string>(currentShipping?.id || 'pac');

  if (!isOpen) return null;

  const options: ShippingOption[] = [
    {
      id: 'pac',
      name: 'PAC Correios',
      time: '4 a 7 dias úteis',
      price: quoteShipping('pac', subtotal),
    },
    {
      id: 'sedex',
      name: 'SEDEX Expresso',
      time: '1 a 3 dias úteis',
      price: quoteShipping('sedex', subtotal),
    },
    {
      id: 'transportadora',
      name: 'Jadlog Transportadora',
      time: '2 a 5 dias úteis',
      price: quoteShipping('transportadora', subtotal),
    },
  ];

  const handleCalculate = (e: React.FormEvent) => {
    e.preventDefault();
    if (cep.replace(/\D/g, '').length >= 8) {
      setCalculated(true);
    }
  };

  const handleApply = () => {
    const chosen = options.find((o) => o.id === selectedOptionId) || options[0];
    onSelectShipping(chosen);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in"
      />

      <div className="min-h-full flex items-center justify-center p-4 text-center sm:p-0">
        <div className="relative bg-white rounded-3xl max-w-md w-full text-left overflow-hidden shadow-2xl border border-[#E7DED3] my-8 animate-in zoom-in-95 duration-200 p-6 space-y-5">
          
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-[#E7DED3]">
            <div className="flex items-center gap-2.5">
              <Truck className="w-5 h-5 text-[#C49A5A]" />
              <h3 className="font-serif-brand text-lg font-semibold text-[#241F1B]">
                Calcular Frete e Prazos
              </h3>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-full text-[#766D64] hover:text-[#2A211B] hover:bg-black/5 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form CEP */}
          <form onSubmit={handleCalculate} className="space-y-3">
            <label className="block text-xs font-semibold text-[#241F1B]">
              Informe o CEP de entrega:
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="00000-000"
                  value={cep}
                  maxLength={9}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\D/g, '');
                    const formatted = raw.length > 5 ? `${raw.slice(0, 5)}-${raw.slice(5, 8)}` : raw;
                    setCep(formatted);
                  }}
                  className="w-full h-10 px-3.5 pl-9 rounded-xl border border-[#E7DED3] text-sm text-[#241F1B] focus:outline-none focus:border-[#C49A5A]"
                />
                <MapPin className="w-4 h-4 text-[#766D64] absolute left-3 top-3" />
              </div>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-[#2A211B] hover:bg-[#C49A5A] text-white text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer"
              >
                Calcular
              </button>
            </div>
            <p className="text-[11px] text-[#766D64]">
              Simulação válida para capitais e cidades de todo o Brasil.
            </p>
          </form>

          {/* Options Result */}
          {calculated && (
            <div
              role="radiogroup"
              aria-label="Modalidade de frete"
              className="space-y-2.5 pt-2 border-t border-[#E7DED3] animate-in fade-in"
            >
              <span className="text-xs font-semibold text-[#241F1B] block">
                Opções disponíveis para o CEP {cep}:
              </span>

              {options.map((opt) => {
                const isSelected = selectedOptionId === opt.id;

                return (
                  <div
                    key={opt.id}
                    role="radio"
                    aria-checked={isSelected}
                    tabIndex={0}
                    onClick={() => setSelectedOptionId(opt.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedOptionId(opt.id);
                      }
                    }}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C49A5A] ${
                      isSelected
                        ? 'border-[#2A211B] bg-[#F8F4ED] shadow-xs'
                        : 'border-[#E7DED3] hover:border-[#C49A5A]/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                          isSelected ? 'border-[#2A211B] bg-[#2A211B]' : 'border-[#766D64]'
                        }`}
                      >
                        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-[#241F1B]">{opt.name}</p>
                        <p className="text-[11px] text-[#766D64]">{opt.time}</p>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-bold text-[#2A211B]">
                        {opt.price === 0 ? (
                          <span className="text-emerald-700">GRÁTIS</span>
                        ) : (
                          `R$ ${opt.price.toFixed(2).replace('.', ',')}`
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}

              <button
                onClick={handleApply}
                className="w-full mt-3 py-3 rounded-xl bg-[#2A211B] hover:bg-[#C49A5A] text-white text-xs font-semibold uppercase tracking-wider transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                <Check className="w-4 h-4" />
                <span>Aplicar frete selecionado</span>
              </button>
            </div>
          )}

          <div className="text-[11px] text-[#766D64] italic text-center pt-1">
            * Valores e prazos são estimativas ilustrativas de protótipo. A cotação oficial dos Correios e transportadoras será conectada no backend.
          </div>

        </div>
      </div>
    </div>
  );
};
