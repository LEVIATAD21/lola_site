import React from 'react';
import { Package, Search, Truck, ShieldCheck, MapPin } from 'lucide-react';

export interface CheckoutAddressData {
  fullName: string;
  phone: string;
  cep: string;
  street: string;
  number: string;
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
  notice?: string | null;
  onChange: (data: CheckoutAddressData) => void;
  onCepSearch: (cep: string) => void;
  isCepSearching?: boolean;
}

const fieldClass = (hasError?: boolean) =>
  `w-full h-11 px-3.5 rounded-xl border text-sm text-[#241F1B] placeholder-[#766D64]/60 focus:outline-none ${
    hasError ? 'border-red-400 focus:border-red-500' : 'border-[#E7DED3] focus:border-[#C49A5A]'
  }`;

export const CheckoutAddressForm: React.FC<CheckoutAddressFormProps> = ({
  data,
  errors = {},
  notice = null,
  onChange,
  onCepSearch,
  isCepSearching = false,
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

  // Aviso de CEP (preenchido pelo CEP ou não encontrado) — vazio quando não há
  // nada a anunciar.
  const avisoCep = !errors.cep && notice ? notice : '';

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
            <label htmlFor="endereco-nome" className="font-semibold text-[#241F1B] block">
              Nome completo <span aria-hidden="true" className="text-[#C49A5A]">*</span>
            </label>
            <input
              id="endereco-nome"
              type="text"
              placeholder="Digite seu nome completo"
              value={data.fullName}
              onChange={(e) => updateField('fullName', e.target.value)}
              aria-required="true"
              aria-invalid={!!errors.fullName}
              aria-describedby={errors.fullName ? 'endereco-nome-erro' : undefined}
              className={fieldClass(!!errors.fullName)}
            />
            {errors.fullName && (
              <p id="endereco-nome-erro" role="alert" className="text-[11px] text-red-600 font-medium">{errors.fullName}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="endereco-telefone" className="font-semibold text-[#241F1B] block">
              Telefone / WhatsApp <span aria-hidden="true" className="text-[#C49A5A]">*</span>
            </label>
            <input
              id="endereco-telefone"
              type="text"
              placeholder="(00) 00000-0000"
              value={data.phone}
              onChange={handlePhoneChange}
              inputMode="tel"
              aria-required="true"
              aria-invalid={!!errors.phone}
              aria-describedby={errors.phone ? 'endereco-telefone-erro' : undefined}
              className={fieldClass(!!errors.phone)}
            />
            {errors.phone && (
              <p id="endereco-telefone-erro" role="alert" className="text-[11px] text-red-600 font-medium">{errors.phone}</p>
            )}
          </div>
        </div>

        {/* Row 2: CEP & Endereço */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
          <div className="sm:col-span-4 space-y-1.5">
            <label htmlFor="endereco-cep" className="font-semibold text-[#241F1B] block">
              CEP <span aria-hidden="true" className="text-[#C49A5A]">*</span>
            </label>
            <div className="relative">
              <input
                id="endereco-cep"
                type="text"
                placeholder="00000-000"
                value={data.cep}
                maxLength={9}
                onChange={handleCepChange}
                inputMode="numeric"
                autoComplete="postal-code"
                aria-required="true"
                aria-invalid={!!errors.cep}
                aria-describedby={errors.cep ? 'endereco-cep-erro' : undefined}
                className={`${fieldClass(!!errors.cep)} pr-9`}
              />
              <button
                type="button"
                onClick={() => onCepSearch(data.cep.replace(/\D/g, ''))}
                className="absolute right-3 top-3 text-[#766D64] hover:text-[#2A211B] cursor-pointer"
                disabled={isCepSearching}
                title={isCepSearching ? 'Consultando CEP...' : 'Buscar endereço pelo CEP'}
                aria-label={isCepSearching ? 'Consultando CEP' : 'Buscar endereço pelo CEP'}
              >
                <Search className="w-4 h-4" />
              </button>
            </div>
            {errors.cep && (
              <p id="endereco-cep-erro" role="alert" className="text-[11px] text-red-600 font-medium">{errors.cep}</p>
            )}
            {/* Região viva permanece no DOM mesmo vazia: leitor de tela só
                anuncia conteúdo que muda dentro de uma região que já existia. */}
            <p role="status" className={avisoCep ? 'text-[11px] text-amber-700 font-medium' : 'sr-only'}>
              {avisoCep}
            </p>
          </div>

          <div className="sm:col-span-8 space-y-1.5">
            <label htmlFor="endereco-logradouro" className="font-semibold text-[#241F1B] block">
              Logradouro <span aria-hidden="true" className="text-[#C49A5A]">*</span>
            </label>
            <input
              id="endereco-logradouro"
              type="text"
              placeholder="Rua ou avenida (preenchido pelo CEP)"
              value={data.street}
              autoComplete="address-line1"
              onChange={(e) => updateField('street', e.target.value)}
              aria-required="true"
              aria-invalid={!!errors.street}
              aria-describedby={errors.street ? 'endereco-logradouro-erro' : undefined}
              className={fieldClass(!!errors.street)}
            />
            {errors.street && (
              <p id="endereco-logradouro-erro" role="alert" className="text-[11px] text-red-600 font-medium">{errors.street}</p>
            )}
          </div>
        </div>

        {/* Row 3: Número, Complemento & Bairro */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="endereco-numero" className="font-semibold text-[#241F1B] block">
              Número <span aria-hidden="true" className="text-[#C49A5A]">*</span>
            </label>
            <input
              id="endereco-numero"
              type="text"
              placeholder="Nº da casa"
              autoComplete="address-line2"
              value={data.number}
              onChange={(e) => updateField('number', e.target.value)}
              aria-required="true"
              aria-invalid={!!errors.number}
              aria-describedby={errors.number ? 'endereco-numero-erro' : undefined}
              className={fieldClass(!!errors.number)}
            />
            {errors.number && (
              <p id="endereco-numero-erro" role="alert" className="text-[11px] text-red-600 font-medium">{errors.number}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="endereco-complemento" className="font-semibold text-[#241F1B] block">Complemento</label>
            <input
              id="endereco-complemento"
              type="text"
              placeholder="Apto, bloco, casa, etc."
              autoComplete="address-line3"
              value={data.complement}
              onChange={(e) => updateField('complement', e.target.value)}
              className={fieldClass()}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="endereco-bairro" className="font-semibold text-[#241F1B] block">
              Bairro <span aria-hidden="true" className="text-[#C49A5A]">*</span>
            </label>
            <input
              id="endereco-bairro"
              type="text"
              placeholder="Bairro"
              autoComplete="address-level3"
              value={data.neighborhood}
              onChange={(e) => updateField('neighborhood', e.target.value)}
              aria-required="true"
              aria-invalid={!!errors.neighborhood}
              aria-describedby={errors.neighborhood ? 'endereco-bairro-erro' : undefined}
              className={fieldClass(!!errors.neighborhood)}
            />
            {errors.neighborhood && (
              <p id="endereco-bairro-erro" role="alert" className="text-[11px] text-red-600 font-medium">{errors.neighborhood}</p>
            )}
          </div>
        </div>

        {/* Row 4: Cidade & Estado */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="endereco-cidade" className="font-semibold text-[#241F1B] block">
              Cidade <span aria-hidden="true" className="text-[#C49A5A]">*</span>
            </label>
            <input
              id="endereco-cidade"
              type="text"
              placeholder="Digite a cidade"
              value={data.city}
              autoComplete="address-level2"
              onChange={(e) => updateField('city', e.target.value)}
              aria-required="true"
              aria-invalid={!!errors.city}
              aria-describedby={errors.city ? 'endereco-cidade-erro' : undefined}
              className={fieldClass(!!errors.city)}
            />
            {errors.city && (
              <p id="endereco-cidade-erro" role="alert" className="text-[11px] text-red-600 font-medium">{errors.city}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="endereco-estado" className="font-semibold text-[#241F1B] block">
              Estado <span aria-hidden="true" className="text-[#C49A5A]">*</span>
            </label>
            <select
              id="endereco-estado"
              value={data.state}
              autoComplete="address-level1"
              onChange={(e) => updateField('state', e.target.value)}
              aria-required="true"
              aria-invalid={!!errors.state}
              aria-describedby={errors.state ? 'endereco-estado-erro' : undefined}
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
              <p id="endereco-estado-erro" role="alert" className="text-[11px] text-red-600 font-medium">{errors.state}</p>
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
