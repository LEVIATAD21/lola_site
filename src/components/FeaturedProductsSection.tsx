import React, { useRef } from 'react';
import { ArrowRight, Heart, ChevronLeft, ChevronRight } from 'lucide-react';
import { FEATURED_PRODUCTS, Product } from '../data/mockData';
import { BadgeEstoque } from './BadgeEstoque';

interface FeaturedProductsSectionProps {
  favorites: string[];
  onToggleFavorite: (product: Product) => void;
  onSelectProduct: (product: Product) => void;
  onViewAllProducts: () => void;
  selectedCategoryFilter?: string | null;
  onClearFilter?: () => void;
}

export const FeaturedProductsSection: React.FC<FeaturedProductsSectionProps> = ({
  favorites,
  onToggleFavorite,
  onSelectProduct,
  onViewAllProducts,
  selectedCategoryFilter,
  onClearFilter,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const displayedProducts = selectedCategoryFilter
    ? FEATURED_PRODUCTS.filter(
        (p) => p.category.toLowerCase() === selectedCategoryFilter.toLowerCase()
      )
    : FEATURED_PRODUCTS;

  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -320, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 320, behavior: 'smooth' });
    }
  };

  return (
    <section id="destaques" className="py-12 sm:py-16 bg-[#F8F4ED] border-t border-[#E7DED3]/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8 sm:mb-10">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="font-serif-brand text-2xl sm:text-3xl font-semibold text-[#241F1B] tracking-tight">
                Produtos em destaque
              </h2>
              {selectedCategoryFilter && (
                <span className="inline-flex items-center gap-1.5 text-xs bg-[#DCC7B0]/30 text-[#2A211B] px-2.5 py-1 rounded-full font-medium">
                  Filtro: {selectedCategoryFilter}
                  {onClearFilter && (
                    <button
                      onClick={onClearFilter}
                      className="hover:text-red-600 font-bold ml-1 text-sm cursor-pointer"
                      title="Limpar filtro"
                    >
                      ×
                    </button>
                  )}
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-[#766D64] mt-1.5 font-normal">
              Escolha suas peças favoritas e leve mais estilo para o seu dia.
            </p>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={onViewAllProducts}
              className="group inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-[#241F1B] hover:text-[#C49A5A] transition-colors cursor-pointer"
            >
              <span>Ver todos</span>
              <ArrowRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-1" />
            </button>
          </div>
        </div>

        {/* Carousel / Product Cards Container with Side Controls */}
        <div className="relative group">
          
          {/* Left Arrow Button */}
          <button
            onClick={scrollLeft}
            aria-label="Rolar produtos para a esquerda"
            className="absolute -left-3 sm:-left-5 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white shadow-lg border border-[#E7DED3] flex items-center justify-center text-[#2A211B] hover:bg-[#F1E8DC] hover:text-[#C49A5A] transition-all opacity-90 hover:opacity-100 cursor-pointer hidden md:flex"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          {/* Right Arrow Button (Matching circular arrow in design 01) */}
          <button
            onClick={scrollRight}
            aria-label="Rolar produtos para a direita"
            className="absolute -right-3 sm:-right-5 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white shadow-lg border border-[#E7DED3] flex items-center justify-center text-[#2A211B] hover:bg-[#F1E8DC] hover:text-[#C49A5A] transition-all opacity-90 hover:opacity-100 cursor-pointer hidden md:flex"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          {/* Scrollable Row */}
          <div
            ref={scrollContainerRef}
            className="flex gap-4 sm:gap-6 overflow-x-auto pb-4 pt-1 px-1 scroll-smooth no-scrollbar snap-x snap-mandatory"
          >
            {displayedProducts.map((product) => {
              const isFav = favorites.includes(product.id);

              return (
                <div
                  key={product.id}
                  className="flex-shrink-0 w-[240px] sm:w-[260px] lg:w-[calc(20%-1.25rem)] snap-start bg-white rounded-2xl overflow-hidden border border-[#E7DED3] hover:border-[#C49A5A]/50 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col group/card"
                >
                  {/* Image & Favorite button */}
                  <div className="relative aspect-square bg-[#F1E8DC] overflow-hidden">
                    <button
                      onClick={() => onSelectProduct(product)}
                      className="w-full h-full block focus:outline-none cursor-pointer"
                      aria-label={`Ver detalhes de ${product.name}`}
                    >
                      <img
                        src={product.image}
                        alt={product.name}
                        className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover/card:scale-105"
                        loading="lazy"
                      />
                    </button>

                    {/* Favorite Heart Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(product);
                      }}
                      aria-label={isFav ? `Remover ${product.name} dos favoritos` : `Adicionar ${product.name} aos favoritos`}
                      className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 hover:bg-white backdrop-blur-xs flex items-center justify-center text-[#2A211B] transition-transform duration-200 hover:scale-110 shadow-sm cursor-pointer z-10"
                    >
                      <Heart
                        className={`w-4 h-4 transition-colors ${
                          isFav ? 'fill-[#C49A5A] text-[#C49A5A]' : 'text-[#766D64] hover:text-[#2A211B]'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Product Details & Actions */}
                  <div className="p-4 flex flex-col flex-1 justify-between gap-3 bg-white">
                    <div>
                      <h3
                        onClick={() => onSelectProduct(product)}
                        className="font-medium text-sm text-[#241F1B] hover:text-[#C49A5A] transition-colors line-clamp-1 cursor-pointer"
                        title={product.name}
                      >
                        {product.name}
                      </h3>
                      <div className="flex items-center justify-between mt-1">
                        <p className="font-semibold text-base text-[#241F1B] tabular-nums">
                          R$ {product.price.toFixed(2).replace('.', ',')}
                        </p>
                        <BadgeEstoque availableUnits={8} showDetailed={false} />
                      </div>
                    </div>

                    {/* Button Ver detalhes matching reference */}
                    <button
                      onClick={() => onSelectProduct(product)}
                      className="w-full py-2 px-3 rounded-lg bg-[#F8F4ED] hover:bg-[#F1E8DC] text-[#241F1B] hover:text-[#2A211B] text-xs font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer border border-[#E7DED3]"
                    >
                      <span>Ver detalhes</span>
                      <ArrowRight className="w-3 h-3 text-[#766D64]" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

        </div>

      </div>
    </section>
  );
};
