import React from 'react';
import { Headphones, ShieldCheck, MessageCircle } from 'lucide-react';

interface ProductEditorialBannerProps {
  onOpenWhatsApp: () => void;
}

export const ProductEditorialBanner: React.FC<ProductEditorialBannerProps> = ({
  onOpenWhatsApp,
}) => {
  return (
    <section className="mt-14 mb-0 bg-[#2A211B] text-white overflow-hidden shadow-xl border-t border-[#C49A5A]/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          
          {/* Left Column: Model Image & Brand Text */}
          <div className="lg:col-span-6 flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden border-2 border-[#C49A5A]/40 shrink-0 shadow-md">
              <img
                src="/images/hero_lola_model_1791578690867.jpg"
                alt="Modelo usando brincos Lola"
                className="w-full h-full object-cover object-[60%_30%]"
              />
            </div>
            <div className="space-y-1">
              <span className="text-[10px] sm:text-xs tracking-[0.25em] text-[#C49A5A] uppercase font-semibold block">
                LOLA
              </span>
              <h2 className="font-script text-3xl sm:text-4xl text-[#F8F4ED] drop-shadow-sm leading-tight select-none">
                Mais que acessórios, é sobre você!
              </h2>
            </div>
          </div>

          {/* Right Column: Support & Security Trust Badges & WhatsApp Action */}
          <div className="lg:col-span-6 flex flex-col sm:flex-row items-center justify-end gap-6 sm:gap-8">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3 text-left">
                <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-[#C49A5A] shrink-0">
                  <Headphones className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-white">Atendimento próximo</h4>
                  <p className="text-[11px] text-white/70">Tire suas dúvidas</p>
                </div>
              </div>

              <div className="flex items-center gap-3 text-left">
                <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-[#C49A5A] shrink-0">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-white">Pagamento seguro</h4>
                  <p className="text-[11px] text-white/70">Seus dados protegidos</p>
                </div>
              </div>
            </div>

            <button
              onClick={onOpenWhatsApp}
              className="px-5 py-3 rounded-full border border-white/40 hover:border-white text-xs font-semibold text-white hover:bg-white hover:text-[#2A211B] transition-all flex items-center gap-2 cursor-pointer shrink-0 shadow-xs"
            >
              <MessageCircle className="w-4 h-4 text-emerald-400" />
              <span>Fale conosco no WhatsApp</span>
            </button>
          </div>

        </div>
      </div>
    </section>
  );
};
