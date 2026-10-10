import React from 'react';
import { ShieldCheck, Heart, Droplets, ArrowRight } from 'lucide-react';

interface CategorySecondaryBannerProps {
  onLearnMore: () => void;
}

export const CategorySecondaryBanner: React.FC<CategorySecondaryBannerProps> = ({
  onLearnMore,
}) => {
  return (
    <section className="mt-16 bg-[#2A211B] text-white rounded-3xl overflow-hidden shadow-xl border border-[#C49A5A]/30">
      <div className="p-8 sm:p-10 lg:p-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          
          {/* Left Column: Heading and Description */}
          <div className="lg:col-span-5 space-y-3 text-left">
            <span className="text-[11px] font-semibold tracking-[0.25em] text-[#C49A5A] uppercase block">
              GARANTIA E QUALIDADE
            </span>
            <h2 className="font-serif-brand text-2xl sm:text-3xl lg:text-4xl font-normal text-white leading-tight">
              Aço inox é beleza que dura.
            </h2>
            <p className="text-white/80 text-xs sm:text-sm font-light leading-relaxed max-w-sm">
              Peças resistentes, hipoalergênicas e perfeitas para o seu dia a dia.
            </p>
          </div>

          {/* Center Column: Close-up photo circle */}
          <div className="lg:col-span-3 flex justify-center">
            <div className="relative w-36 h-36 sm:w-44 sm:h-44 rounded-full overflow-hidden border-2 border-[#C49A5A]/50 shadow-lg">
              <img
                src="/src/assets/images/hero_lola_model_1791578690867.jpg"
                alt="Detalhe de brinco em aço inox"
                className="w-full h-full object-cover object-[62%_30%]"
              />
              <div className="absolute inset-0 bg-radial-gradient from-transparent to-black/30 pointer-events-none" />
            </div>
          </div>

          {/* Right Column: 3 Features & Learn More CTA */}
          <div className="lg:col-span-4 flex flex-col justify-between space-y-6">
            <div className="space-y-3.5">
              
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-[#C49A5A] shrink-0">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <span className="text-xs sm:text-sm font-medium text-white/95">
                  Aço inox de alta qualidade
                </span>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-[#C49A5A] shrink-0">
                  <Heart className="w-4 h-4" />
                </div>
                <span className="text-xs sm:text-sm font-medium text-white/95">
                  Hipoalergênico
                </span>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-[#C49A5A] shrink-0">
                  <Droplets className="w-4 h-4" />
                </div>
                <span className="text-xs sm:text-sm font-medium text-white/95">
                  Não escurece
                </span>
              </div>

            </div>

            <div>
              <button
                onClick={onLearnMore}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full border border-white/40 hover:border-white text-xs font-semibold text-white hover:bg-white hover:text-[#2A211B] transition-all cursor-pointer group"
              >
                <span>Saiba mais</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
              </button>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};
