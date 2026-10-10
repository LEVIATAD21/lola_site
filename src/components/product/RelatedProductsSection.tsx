import React, { useRef } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Heart, ShoppingBag } from 'lucide-react';
import { Product } from '../../data/mockData';

interface RelatedProductsSectionProps {
  products: Product[];
  favorites: string[];
  onToggleFavorite: (product: Product) => void;
  onAddToCart: (product: Product) => void;
  onSelectProduct: (product: Product) => void;
  onViewAll: () => void;
}

export const RelatedProductsSection: React.FC<RelatedProductsSectionProps> = ({
  products,
  favorites,
  onToggleFavorite,
  onAddToCart,
  onSelectProduct,
  onViewAll,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -300, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 300, behavior: 'smooth' });
    }
  };

  return (
    <section className="my-14 border-t border-[#E7DED3]/60 pt-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h2 className="font-serif-brand text-2xl sm:text-3xl font-semibold text-[#241F1B] tracking-tight">
            Você também pode gostar
          </h2>

          <button
            onClick={onViewAll}
            className="group inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-[#241F1B] hover:text-[#C49A5A] transition-colors cursor-pointer"
          >
            <span>Ver todos</span>
            <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
          </button>
        </div>

        {/* Carousel Container with Side Controls */}
        <div className="relative group">
          {/* Left Arrow */}
          <button
            onClick={scrollLeft}
            aria-label="Rolar recomendados para esquerda"
            className="absolute -left-3 sm:-left-5 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white shadow-lg border border-[#E7DED3] flex items-center justify-center text-[#2A211B] hover:bg-[#F1E8DC] transition-all cursor-pointer hidden md:flex"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          {/* Right Arrow */}
          <button
            onClick={scrollRight}
            aria-label="Rolar recomendados para direita"
            className="absolute -right-3 sm:-right-5 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white shadow-lg border border-[#E7DED3] flex items-center justify-center text-[#2A211B] hover:bg-[#F1E8DC] transition-all cursor-pointer hidden md:flex"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          {/* Scrollable Row (5 cards matching screenshot) */}
          <div
            ref={scrollContainerRef}
            className="flex gap-4 sm:gap-6 overflow-x-auto pb-4 pt-1 px-1 scroll-smooth no-scrollbar snap-x snap-mandatory"
          >
            {products.map((product) => {
              const isFav = favorites.includes(product.id);

              return (
                <div
                  key={product.id}
                  className="flex-shrink-0 w-[230px] sm:w-[250px] lg:w-[calc(20%-1.25rem)] snap-start bg-white rounded-2xl overflow-hidden border border-[#E7DED3] hover:border-[#C49A5A]/50 shadow-xs hover:shadow-md transition-all duration-300 flex flex-col group/card text-left"
                >
                  {/* Image */}
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

                    {/* Favorite Heart */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(product);
                      }}
                      aria-label={isFav ? 'Remover favorito' : 'Favoritar'}
                      className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-white/90 hover:bg-white flex items-center justify-center text-[#2A211B] shadow-xs cursor-pointer z-10 transition-transform hover:scale-110"
                    >
                      <Heart
                        className={`w-3.5 h-3.5 ${
                          isFav ? 'fill-[#C49A5A] text-[#C49A5A]' : 'text-[#766D64]'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Info & Button */}
                  <div className="p-3.5 flex flex-col flex-1 justify-between gap-3">
                    <div className="space-y-1">
                      <h3
                        onClick={() => onSelectProduct(product)}
                        className="font-medium text-xs sm:text-sm text-[#241F1B] hover:text-[#C49A5A] transition-colors line-clamp-1 cursor-pointer"
                        title={product.name}
                      >
                        {product.name}
                      </h3>

                      <p className="font-semibold text-sm text-[#241F1B] tabular-nums pt-0.5">
                        R$ {product.price.toFixed(2).replace('.', ',')}
                      </p>
                    </div>

                    <button
                      onClick={() => onSelectProduct(product)}
                      className="w-full py-2 px-2.5 rounded-xl bg-[#F8F4ED] hover:bg-[#F1E8DC] text-[#241F1B] text-[11px] font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer border border-[#E7DED3]"
                    >
                      <span>Ver produto</span>
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
