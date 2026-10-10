import React from 'react';
import { ChevronRight } from 'lucide-react';

interface CategoryBannerProps {
  onNavigateHome: () => void;
  onNavigateCategories: () => void;
}

export const CategoryBanner: React.FC<CategoryBannerProps> = ({
  onNavigateHome,
  onNavigateCategories,
}) => {
  return (
    <section className="relative w-full overflow-hidden bg-[#2A211B] min-h-[260px] sm:min-h-[300px] lg:min-h-[340px] flex items-center">
      {/* Background image matching reference */}
      <div className="absolute inset-0 z-0">
        <img
          src="/src/assets/images/hero_lola_model_1791578690867.jpg"
          alt="Modelo usando brincos de argola em aço inox dourado"
          className="w-full h-full object-cover object-[center_25%]"
        />
        {/* Gradients to guarantee high readability and warm golden atmosphere */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#2A211B]/90 via-[#2A211B]/60 to-[#2A211B]/20" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full py-8 lg:py-10">
        
        {/* Breadcrumbs */}
        <nav aria-label="Migalhas de navegação" className="mb-4">
          <ol className="flex items-center gap-1.5 text-xs text-[#DCC7B0] font-light">
            <li>
              <button
                onClick={onNavigateHome}
                className="hover:text-white transition-colors cursor-pointer"
              >
                Início
              </button>
            </li>
            <li>
              <ChevronRight className="w-3 h-3 text-[#DCC7B0]/60" />
            </li>
            <li>
              <button
                onClick={onNavigateCategories}
                className="hover:text-white transition-colors cursor-pointer"
              >
                Categorias
              </button>
            </li>
            <li>
              <ChevronRight className="w-3 h-3 text-[#DCC7B0]/60" />
            </li>
            <li className="text-white font-medium" aria-current="page">
              Brincos
            </li>
          </ol>
        </nav>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          
          <div className="lg:col-span-8 space-y-2">
            <h1 className="font-serif-brand text-3xl sm:text-5xl lg:text-6xl font-normal text-white leading-tight tracking-tight drop-shadow-sm">
              Brincos
            </h1>
            <p className="text-white/90 text-sm sm:text-base font-light max-w-xl leading-relaxed">
              Peças que realçam sua beleza em todos os momentos.
            </p>
          </div>

          {/* Right Column: Handwritten Script detail matching reference image */}
          <div className="hidden lg:flex lg:col-span-4 justify-end items-center pr-2">
            <div className="text-right space-y-1.5 animate-in fade-in duration-500">
              <p className="font-script text-2xl xl:text-3xl text-[#F8F4ED] drop-shadow leading-snug select-none">
                Pequenos detalhes, grandes impactos. ♡
              </p>
              <div className="w-24 h-[1px] bg-[#DCC7B0]/60 ml-auto" />
            </div>
          </div>

        </div>

      </div>
    </section>
  );
};
