import React from 'react';

export const CartBanner: React.FC = () => {
  return (
    <section className="relative w-full overflow-hidden bg-[#2A211B] min-h-[220px] sm:min-h-[260px] lg:min-h-[280px] flex items-center">
      {/* Background jewelry photography matching Design 04 */}
      <div className="absolute inset-0 z-0">
        <img
          src="/src/assets/images/cart_banner_jewelry_1791585126765.jpg"
          alt="Joias douradas delicadas sobre seda"
          className="w-full h-full object-cover object-[center_35%]"
        />
        {/* Soft dark gradient overlays to guarantee contrast */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#2A211B]/95 via-[#2A211B]/70 to-[#2A211B]/30" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full py-8 lg:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          
          {/* Left Column: Kicker, Heading, Subtitle */}
          <div className="lg:col-span-8 space-y-2 text-left">
            <span className="text-[10px] sm:text-xs font-semibold tracking-[0.25em] text-[#C49A5A] uppercase block">
              SACOLA DE COMPRAS
            </span>
            <h1 className="font-serif-brand text-2xl sm:text-4xl lg:text-5xl font-normal text-white leading-tight tracking-tight drop-shadow-sm">
              Seus itens favoritos estão aqui!
            </h1>
            <p className="text-white/85 text-xs sm:text-sm font-light max-w-lg leading-relaxed">
              Revise seus produtos e finalize sua compra.
            </p>
          </div>

          {/* Right Column: Handwritten Script detail matching Design 04 reference */}
          <div className="hidden lg:flex lg:col-span-4 justify-end items-center pr-2">
            <div className="text-right space-y-1.5 animate-in fade-in duration-500">
              <p className="font-script text-2xl xl:text-3xl text-[#F8F4ED] drop-shadow leading-snug select-none">
                Pequenos detalhes, grandes momentos! ♡
              </p>
              <div className="w-24 h-[1px] bg-[#DCC7B0]/60 ml-auto" />
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};
