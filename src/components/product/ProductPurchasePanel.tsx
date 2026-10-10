import React, { useState } from 'react';
import { ShoppingBag, MessageCircle, Truck, ShieldCheck, RefreshCw, CreditCard, Check } from 'lucide-react';
import { Product } from '../../data/mockData';
import { BadgeEstoque } from '../BadgeEstoque';

interface ProductPurchasePanelProps {
  product: Product;
  selectedSize: string;
  onSelectSize: (size: string) => void;
  onAddToCart: (product: Product, quantity: number, size: string) => void;
  onOpenWhatsApp: (product: Product, size: string) => void;
  onOpenInfo: (title: string, content: string) => void;
  availableUnits?: number | null;
}

export const ProductPurchasePanel: React.FC<ProductPurchasePanelProps> = ({
  product,
  selectedSize,
  onSelectSize,
  onAddToCart,
  onOpenWhatsApp,
  onOpenInfo,
  availableUnits,
}) => {
  const [quantity, setQuantity] = useState(1);
  const [isAdded, setIsAdded] = useState(false);

  const sizeOptions = [
    { label: 'P (1,5 cm)', value: 'P (1,5 cm)' },
    { label: 'M (2,0 cm)', value: 'M (2,0 cm)' },
    { label: 'G (2,5 cm)', value: 'G (2,5 cm)' },
  ];

  const hasConfirmedStock = typeof availableUnits === 'number';
  const isOutOfStock = hasConfirmedStock && availableUnits <= 0;
  const isStockUnknown = !hasConfirmedStock;
  const canPurchase = hasConfirmedStock && availableUnits > 0;
  const maxQuantity = canPurchase ? availableUnits : 0;

  const handleAdd = () => {
    if (!canPurchase) return;
    if (quantity <= 0 || quantity > (availableUnits ?? 0)) return;
    onAddToCart(product, quantity, selectedSize);
    setIsAdded(true);
    setTimeout(() => setIsAdded(false), 2000);
  };

  return (
    <div className="w-full space-y-6 text-left">
      
      {/* 1. Title & Stock badge */}
      <div className="space-y-3">
        <h1 className="font-serif-brand text-3xl sm:text-4xl lg:text-5xl font-normal text-[#241F1B] tracking-tight leading-tight">
          {product.name}
        </h1>

        <div className="flex flex-wrap items-center gap-3 pt-0.5">
          <BadgeEstoque availableUnits={availableUnits} />
        </div>
      </div>

      {/* 2. Price */}
      <div className="space-y-1.5 pb-2 border-b border-[#E7DED3]">
        <div className="text-3xl sm:text-4xl font-semibold text-[#241F1B] tabular-nums tracking-tight">
          R$ {product.price.toFixed(2).replace('.', ',')}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-[#766D64]">
          <span>Condições de parcelamento sob consulta na finalização</span>
          <CreditCard className="w-3.5 h-3.5 text-[#2A211B]" />
        </div>
      </div>

      {/* 3. Size Variant Selector */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-xs font-semibold text-[#241F1B]">
          <span>Tamanho</span>
          <span className="text-[#C49A5A] font-medium">{selectedSize}</span>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          {sizeOptions.map((opt) => {
            const isSelected = selectedSize === opt.value;

            return (
              <button
                key={opt.value}
                onClick={() => onSelectSize(opt.value)}
                className={`py-2.5 px-3 rounded-xl text-xs font-medium transition-all cursor-pointer border ${
                  isSelected
                    ? 'bg-[#2A211B] text-white border-[#2A211B] shadow-xs'
                    : 'bg-white hover:bg-[#F1E8DC] text-[#241F1B] border-[#E7DED3]'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Quantity Selector */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-xs font-semibold text-[#241F1B]">
            Quantidade
          </label>
          {hasConfirmedStock ? (
            <span className="text-[11px] text-[#766D64]">
              {availableUnits > 0 ? `Disponível: ${availableUnits} un.` : 'Sem estoque'}
            </span>
          ) : (
            <span className="text-[11px] text-[#766D64]">
              Disponibilidade sob consulta
            </span>
          )}
        </div>
        <div className="flex items-center w-36 border border-[#E7DED3] rounded-xl bg-white overflow-hidden">
          <button
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
            disabled={!canPurchase || quantity <= 1}
            aria-label="Diminuir quantidade"
            className="w-11 h-10 flex items-center justify-center text-sm font-semibold text-[#766D64] hover:text-[#2A211B] hover:bg-[#F8F4ED] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            −
          </button>
          <span className={`flex-1 text-center text-xs font-bold tabular-nums ${canPurchase ? 'text-[#241F1B]' : 'text-stone-400'}`}>
            {canPurchase ? quantity : 0}
          </span>
          <button
            onClick={() => setQuantity(Math.min(maxQuantity, quantity + 1))}
            disabled={!canPurchase || quantity >= maxQuantity}
            aria-label="Aumentar quantidade"
            className="w-11 h-10 flex items-center justify-center text-sm font-semibold text-[#766D64] hover:text-[#2A211B] hover:bg-[#F8F4ED] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            +
          </button>
        </div>
      </div>

      {/* 5. CTA Action Buttons */}
      <div className="space-y-3 pt-2">
        
        {/* Primary CTA: Adicionar à sacola */}
        <button
          onClick={handleAdd}
          disabled={!canPurchase}
          className={`w-full py-4 px-6 rounded-2xl font-semibold text-xs sm:text-sm tracking-wider uppercase transition-all flex items-center justify-center gap-2.5 shadow-md active:scale-[0.99] ${
            !canPurchase
              ? 'bg-stone-200 text-stone-500 cursor-not-allowed border border-stone-300 shadow-none'
              : isAdded
              ? 'bg-emerald-700 text-white cursor-pointer'
              : 'bg-[#2A211B] hover:bg-[#C49A5A] text-white cursor-pointer'
          }`}
          title={
            !canPurchase
              ? isOutOfStock
                ? 'Produto esgotado'
                : 'Disponibilidade sob consulta — estoque não confirmado'
              : undefined
          }
        >
          {isOutOfStock ? (
            <span>Produto Indisponível</span>
          ) : isStockUnknown ? (
            <span>Consulte disponibilidade</span>
          ) : isAdded ? (
            <>
              <Check className="w-4 h-4" />
              <span>Adicionado à sacola!</span>
            </>
          ) : (
            <>
              <ShoppingBag className="w-4 h-4" />
              <span>Adicionar à sacola</span>
            </>
          )}
        </button>

        {/* Secondary CTA: WhatsApp */}
        <button
          onClick={() => onOpenWhatsApp(product, selectedSize)}
          className="w-full py-3.5 px-6 rounded-2xl bg-white hover:bg-[#F1E8DC]/80 text-[#241F1B] border border-[#2A211B] font-semibold text-xs sm:text-sm tracking-wide transition-colors flex items-center justify-center gap-2.5 cursor-pointer"
        >
          <MessageCircle className="w-4 h-4 text-emerald-600" />
          <span>{canPurchase ? 'Comprar pelo WhatsApp' : 'Consultar pelo WhatsApp'}</span>
        </button>

      </div>

      {/* 6. Operational Trust Strip (below buttons) */}
      <div className="pt-4 border-t border-[#E7DED3] grid grid-cols-3 gap-2 text-center text-[#766D64]">
        
        <button
          onClick={() =>
            onOpenInfo(
              'Frete Rápido para Todo o Brasil',
              'Enviamos seus pedidos com seguro e código de rastreamento pelos Correios e transportadoras parceiras.\n\n• Capitais: 2 a 5 dias úteis\n• Interior: 4 a 10 dias úteis'
            )
          }
          className="p-2 rounded-xl hover:bg-white transition-colors cursor-pointer text-left sm:text-center"
        >
          <Truck className="w-4 h-4 text-[#C49A5A] mx-auto mb-1" />
          <h4 className="text-[11px] font-semibold text-[#241F1B] leading-tight">Frete rápido</h4>
          <p className="text-[10px] text-[#766D64]">Para todo o Brasil</p>
        </button>

        <button
          onClick={() =>
            onOpenInfo(
              'Compra 100% Segura',
              'Seus dados e pagamentos são criptografados com certificado SSL e protegidos com os mais altos padrões de segurança do e-commerce.'
            )
          }
          className="p-2 rounded-xl hover:bg-white transition-colors cursor-pointer text-left sm:text-center"
        >
          <ShieldCheck className="w-4 h-4 text-[#C49A5A] mx-auto mb-1" />
          <h4 className="text-[11px] font-semibold text-[#241F1B] leading-tight">Compra segura</h4>
          <p className="text-[10px] text-[#766D64]">Seus dados protegidos</p>
        </button>

        <button
          onClick={() =>
            onOpenInfo(
              'Política de Troca Fácil',
              'Garantimos a primeira troca gratuita em até 7 dias corridos após o recebimento da encomenda, caso a peça não tenha servido perfeitamente.'
            )
          }
          className="p-2 rounded-xl hover:bg-white transition-colors cursor-pointer text-left sm:text-center"
        >
          <RefreshCw className="w-4 h-4 text-[#C49A5A] mx-auto mb-1" />
          <h4 className="text-[11px] font-semibold text-[#241F1B] leading-tight">Troca fácil</h4>
          <p className="text-[10px] text-[#766D64]">Até 7 dias</p>
        </button>

      </div>

    </div>
  );
};
