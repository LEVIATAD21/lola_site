import React, { useState } from 'react';
import { Check, Images, Info } from 'lucide-react';
import { Product } from '../../data/mockData';

interface ProductDetailsSectionProps {
  product: Product;
  images: string[];
  onOpenAllPhotos: () => void;
  selectedSize: string;
}

export const ProductDetailsSection: React.FC<ProductDetailsSectionProps> = ({
  product,
  images,
  onOpenAllPhotos,
  selectedSize,
}) => {
  const [activeTab, setActiveTab] = useState<'descricao' | 'especificacoes'>('descricao');

  const miniGalleryImages = images.slice(0, 4);
  const materialLabel = product.material || 'Aço inox';
  const colorLabel = product.color || 'Dourado';

  return (
    <section className="my-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

          {/* 1. Left Column: 2x2 Mini Photo Grid (lg:col-span-4) */}
          <div className="lg:col-span-4 space-y-3">
            <div className="grid grid-cols-2 gap-2.5">
              {miniGalleryImages.map((img, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={onOpenAllPhotos}
                  aria-label={`Abrir foto ${idx + 1} em tela cheia`}
                  className="aspect-square rounded-2xl overflow-hidden bg-[#F1E8DC] border border-[#E7DED3] group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C49A5A]"
                >
                  <img
                    src={img}
                    alt={`Foto detalhe ${idx + 1}`}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </button>
              ))}
            </div>

            <button
              onClick={onOpenAllPhotos}
              className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-[#F1E8DC] text-[#241F1B] border border-[#E7DED3] text-xs font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <Images className="w-4 h-4 text-[#766D64]" />
              <span>Ver todas as fotos</span>
            </button>
          </div>

          {/* 2. Center Column: Tabs & Content (lg:col-span-5) */}
          <div className="lg:col-span-5 space-y-6 text-left">

            {/* Tabs Header */}
            <div className="flex items-center gap-8 border-b border-[#E7DED3] pb-1">
              <button
                onClick={() => setActiveTab('descricao')}
                className={`pb-3 text-sm font-semibold transition-colors relative cursor-pointer ${
                  activeTab === 'descricao'
                    ? 'text-[#2A211B] after:content-[\'\'] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[#2A211B]'
                    : 'text-[#766D64] hover:text-[#2A211B]'
                }`}
              >
                Descrição
              </button>
              <button
                onClick={() => setActiveTab('especificacoes')}
                className={`pb-3 text-sm font-semibold transition-colors relative cursor-pointer ${
                  activeTab === 'especificacoes'
                    ? 'text-[#2A211B] after:content-[\'\'] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[#2A211B]'
                    : 'text-[#766D64] hover:text-[#2A211B]'
                }`}
              >
                Especificações
              </button>
            </div>

            {/* Tab: Descrição */}
            {activeTab === 'descricao' && (
              <div className="space-y-5 animate-in fade-in duration-200">
                <h2 className="font-serif-brand text-2xl font-normal text-[#241F1B]">
                  {product.name}
                </h2>
                <p className="text-xs sm:text-sm text-[#766D64] leading-relaxed">
                  {product.description}
                </p>

                {/* Atributos confirmados na ficha do produto selecionado */}
                <div className="space-y-2.5 pt-1">
                  <div className="flex items-center gap-3 text-xs sm:text-sm text-[#241F1B]">
                    <div className="w-5 h-5 rounded-full bg-[#2A211B] text-white flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3" />
                    </div>
                    <span>Material declarado: {materialLabel}</span>
                  </div>

                  <div className="flex items-center gap-3 text-xs sm:text-sm text-[#241F1B]">
                    <div className="w-5 h-5 rounded-full bg-[#2A211B] text-white flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3" />
                    </div>
                    <span>Cor declarada: {colorLabel}</span>
                  </div>

                  <div className="flex items-center gap-3 text-xs sm:text-sm text-[#241F1B]">
                    <div className="w-5 h-5 rounded-full bg-[#2A211B] text-white flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3" />
                    </div>
                    <span>Composição, banho e garantia são confirmados com a loja antes da compra</span>
                  </div>
                </div>
              </div>
            )}

            {/* Tab: Especificações */}
            {activeTab === 'especificacoes' && (
              <div className="space-y-3.5 text-xs sm:text-sm text-[#241F1B] animate-in fade-in duration-200">
                <div className="flex justify-between py-2 border-b border-[#E7DED3]">
                  <span className="text-[#766D64]">Categoria</span>
                  <span className="font-medium">{product.category}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-[#E7DED3]">
                  <span className="text-[#766D64]">Material</span>
                  <span className="font-medium">{materialLabel}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-[#E7DED3]">
                  <span className="text-[#766D64]">Cor</span>
                  <span className="font-medium">{colorLabel}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-[#E7DED3]">
                  <span className="text-[#766D64]">Tamanho selecionado</span>
                  <span className="font-medium">{selectedSize}</span>
                </div>
                <p className="text-[11px] text-[#766D64] leading-relaxed pt-1">
                  Especificações técnicas complementares (peso, fecho e banho) serão confirmadas com a loja no atendimento — evitamos informar detalhes que não correspondem à peça escolhida.
                </p>
              </div>
            )}

          </div>

          {/* 3. Right Column: Card Detalhes do produto (lg:col-span-3) */}
          <div className="lg:col-span-3 bg-[#F1E8DC]/50 p-6 rounded-3xl border border-[#E7DED3] space-y-4 text-left">
            <h3 className="font-serif-brand text-base font-semibold text-[#241F1B]">
              Detalhes do produto
            </h3>

            <div className="space-y-2.5 text-xs text-[#241F1B]">
              <div className="flex justify-between py-1.5 border-b border-[#E7DED3]">
                <span className="text-[#766D64]">Material</span>
                <span className="font-medium">{materialLabel}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#E7DED3]">
                <span className="text-[#766D64]">Cor</span>
                <span className="font-medium">{colorLabel}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#E7DED3]">
                <span className="text-[#766D64]">Tamanho</span>
                <span className="font-medium">{selectedSize}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#E7DED3]">
                <span className="text-[#766D64]">Categoria</span>
                <span className="font-medium">{product.category}</span>
              </div>
            </div>

            {/* Information Callout Box */}
            <div className="p-3.5 bg-white/80 rounded-2xl border border-[#E7DED3] flex items-start gap-2.5 text-[11px] text-[#766D64] leading-relaxed">
              <Info className="w-4 h-4 text-[#2A211B] shrink-0 mt-0.5" />
              <p>
                As especificações exibidas são as informadas para esta peça. Confirme qualquer detalhe adicional com o atendimento da loja antes de comprar.
              </p>
            </div>

          </div>

        </div>
      </div>
    </section>
  );
};
