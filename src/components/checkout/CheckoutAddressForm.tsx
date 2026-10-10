import React from 'react';
import { Package, Search, Truck, ShieldCheck, MapPin } from 'lucide-react';

export interface CheckoutAddressData {
  fullName: string;
  phone: string;
  cep: string;
  street: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  saveAddress: boolean;
}

export type CheckoutAddressErrors = Partial<Record<keyof CheckoutAddressData, string>>;

interface CheckoutAddressFormProps {
  data: CheckoutAddressData;
  errors?: CheckoutAddressErrors;
  onChange: (data: CheckoutAddressData) => void;
  onCepSearch: (cep: string) => void;
}

const fieldClass = (hasError?: boolean) =>
  `w-full h-11 px-3.5 rounded-xl border text-sm text-[#241F1B] placeholder-[#766D64]/60 focus:outline-none ${
    hasError ? 'border-red-400 focus:border-red-500' : 'border-[#E7DED3] focus:border-[#C49A5A]'
  }`;

export const CheckoutAddressForm: React.FC<CheckoutAddressFormProps> = ({
  data,
  errors = {},
  onChange,
  onCepSearch,
}) => {
  const brazilianStates = [
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
    'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
    'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
  ];

  const updateField = (field: keyof CheckoutAddressData, val: any) => {
    onChange({ ...data, [field]: val });
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 11);
    let formatted = raw;
    if (raw.length > 2 && raw.length <= 6) {
      formatted = `(${raw.slice(0, 2)}) ${raw.slice(2)}`;
    } else if (raw.length > 6 && raw.length <= 10) {
      formatted = `(${raw.slice(0, 2)}) ${raw.slice(2, 6)}-${raw.slice(6)}`;
    } else if (raw.length > 10) {
      formatted = `(${raw.slice(0, 2)}) ${raw.slice(2, 7)}-${raw.slice(7)}`;
    }
    updateField('phone', formatted);
  };

  const handleCepChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 8);
    const formatted = raw.length > 5 ? `${raw.slice(0, 5)}-${raw.slice(5, 8)}` : raw;
    updateField('cep', formatted);

    if (raw.length === 8) {
      onCepSearch(raw);
    }
  };

  return (
    <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#E7DED3] shadow-xs text-left space-y-6">

      {/* Title */}
      <div className="space-y-1 pb-2 border-b border-[#E7DED3]">
        <div className="flex items-center gap-2.5">
          <Package className="w-5 h-5 text-[#2A211B]" />
          <h2 className="font-serif-brand text-xl font-semibold text-[#241F1B]">
            1. Dados de entrega
          </h2>
        </div>
        <p className="text-xs text-[#766D64]">
          Informe o endereço para onde deseja receber seu pedido.
        </p>
      </div>

      {/* Form Fields */}
      <div className="space-y-4 text-xs">

        {/* Row 1: Nome completo & Telefone */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="font-semibold text-[#241F1B] block">
              Nome completo <span className="text-[#C49A5A]">*</span>
            </label>
            <input
              type="text"
              placeholder="Digite seu nome completo"
              value={data.fullName}
              onChange={(e) => updateField('fullName', e.target.value)}
              aria-invalid={!!errors.fullName}
              className={fieldClass(!!errors.fullName)}
            />
            {errors.fullName && (
              <p className="text-[11px] text-red-600 font-medium">{errors.fullName}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="font-semibold text-[#241F1B] block">
              Telefone / WhatsApp <span className="text-[#C49A5A]">*</span>
            </label>
            <input
              type="text"
              placeholder="(00) 00000-0000"
              value={data.phone}
              onChange={handlePhoneChange}
              inputMode="tel"
              aria-invalid={!!errors.phone}
              className={fieldClass(!!errors.phone)}
            />
            {errors.phone && (
              <p className="text-[11px] text-red-600 font-medium">{errors.phone}</p>
            )}
          </div>
        </div>

        {/* Row 2: CEP & Endereço */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
          <div className="sm:col-span-4 space-y-1.5">
            <label className="font-semibold text-[#241F1B] block">
              CEP <span className="text-[#C49A5A]">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="00000-000"
                value={data.cep}
                maxLength={9}
                onChange={handleCepChange}
                inputMode="numeric"
                aria-invalid={!!errors.cep}
                className={`${fieldClass(!!errors.cep)} pr-9`}
              />
              <button
                type="button"
                onClick={() => onCepSearch(data.cep.replace(/\D/g, ''))}
                className="absolute right-3 top-3 text-[#766D64] hover:text-[#2A211B] cursor-pointer"
                title="Buscar CEP"
              >
                <Search className="w-4 h-4" />
              </button>
            </div>
            {errors.cep && (
              <p className="text-[11px] text-red-600 font-medium">{errors.cep}</p>
            )}
          </div>

          <div className="sm:col-span-8 space-y-1.5">
            <label className="font-semibold text-[#241F1B] block">
              Endereço <span className="text-[#C49A5A]">*</span>
            </label>
            <input
              type="text"
              placeholder="Rua, Avenida, Número"
              value={data.street}
              onChange={(e) => updateField('street', e.target.value)}
              aria-invalid={!!errors.street}
              className={fieldClass(!!errors.street)}
            />
            {errors.street && (
              <p className="text-[11px] text-red-600 font-medium">{errors.street}</p>
            )}
          </div>
        </div>

        {/* Row 3: Complemento & Bairro */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="font-semibold text-[#241F1B] block">
              Complemento
            </label>
            <input
              type="text"
              placeholder="Apto, bloco, casa, etc."
              value={data.complement}
              onChange={(e) => updateField('complement', e.target.value)}
              className={fieldClass()}
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-semibold text-[#241F1B] block">
              Bairro <span className="text-[#C49A5A]">*</span>
            </label>
            <input
              type="text"
              placeholder="Bairro"
              value={data.neighborhood}
              onChange={(e) => updateField('neighborhood', e.target.value)}
              aria-invalid={!!errors.neighborhood}
              className={fieldClass(!!errors.neighborhood)}
            />
            {errors.neighborhood && (
              <p className="text-[11px] text-red-600 font-medium">{errors.neighborhood}</p>
            )}
          </div>
        </div>

        {/* Row 4: Cidade & Estado */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="font-semibold text-[#241F1B] block">
              Cidade <span className="text-[#C49A5A]">*</span>
            </label>
            <input
              type="text"
              placeholder="Digite a cidade"
              value={data.city}
              onChange={(e) => updateField('city', e.target.value)}
              aria-invalid={!!errors.city}
              className={fieldClass(!!errors.city)}
            />
            {errors.city && (
              <p className="text-[11px] text-red-600 font-medium">{errors.city}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="font-semibold text-[#241F1B] block">
              Estado <span className="text-[#C49A5A]">*</span>
            </label>
            <select
              value={data.state}
              onChange={(e) => updateField('state', e.target.value)}
              aria-label="Estado federativo"
              aria-invalid={!!errors.state}
              className={`w-full h-11 px-3.5 rounded-xl border text-sm text-[#241F1B] bg-white focus:outline-none cursor-pointer ${
                errors.state
                  ? 'border-red-400 focus:border-red-500'
                  : 'border-[#E7DED3] focus:border-[#C49A5A]'
              }`}
            >
              <option value="">Selecione o estado</option>
              {brazilianStates.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
            {errors.state && (
              <p className="text-[11px] text-red-600 font-medium">{errors.state}</p>
            )}
          </div>
        </div>

        {/* Checkbox Salvar este endereço */}
        <div className="pt-1">
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={data.saveAddress}
              onChange={(e) => updateField('saveAddress', e.target.checked)}
              className="w-4 h-4 accent-[#2A211B] text-[#2A211B] rounded border-[#E7DED3] cursor-pointer"
            />
            <span className="text-xs text-[#241F1B]">
              Salvar este endereço para próximas compras
            </span>
          </label>
        </div>

      </div>

      {/* Trust Badges Strip (matching Design 05 screenshot) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-[#E7DED3]">
        <div className="p-3 bg-[#F8F4ED]/60 rounded-2xl flex items-center gap-2.5 border border-[#E7DED3]/60">
          <Truck className="w-4 h-4 text-[#C49A5A] shrink-0" />
          <div className="text-[11px] leading-tight">
            <span className="font-semibold text-[#241F1B] block">Entrega segura</span>
            <span className="text-[#766D64]">Receba no conforto da sua casa</span>
          </div>
        </div>

        <div className="p-3 bg-[#F8F4ED]/60 rounded-2xl flex items-center gap-2.5 border border-[#E7DED3]/60">
          <ShieldCheck className="w-4 h-4 text-[#C49A5A] shrink-0" />
          <div className="text-[11px] leading-tight">
            <span className="font-semibold text-[#241F1B] block">Rastreio do pedido</span>
            <span className="text-[#766D64]">Acompanhe em tempo real</span>
          </div>
        </div>

        <div className="p-3 bg-[#F8F4ED]/60 rounded-2xl flex items-center gap-2.5 border border-[#E7DED3]/60">
          <MapPin className="w-4 h-4 text-[#C49A5A] shrink-0" />
          <div className="text-[11px] leading-tight">
            <span className="font-semibold text-[#241F1B] block">Diversas opções</span>
            <span className="text-[#766D64]">PAC, Sedex e retirada</span>
          </div>
        </div>
      </div>

    </div>
  );
};
