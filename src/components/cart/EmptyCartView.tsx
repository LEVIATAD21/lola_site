import React from 'react';
import { ShoppingBag, ArrowRight } from 'lucide-react';

interface EmptyCartViewProps {
  onContinueShopping: () => void;
}

export const EmptyCartView: React.FC<EmptyCartViewProps> = ({ onContinueShopping }) => {
  return (
    <div className="bg-white rounded-3xl p-12 sm:p-16 border border-[#E7DED3] text-center max-w-xl mx-auto space-y-5 my-8 shadow-xs">
      <div className="w-20 h-20 rounded-full bg-[#F1E8DC] mx-auto flex items-center justify-center text-[#766D64]">
        <ShoppingBag className="w-10 h-10 stroke-[1.5]" />
      </div>

      <div className="space-y-2">
        <h2 className="font-serif-brand text-2xl sm:text-3xl font-normal text-[#241F1B]">
          Sua sacola está vazia
        </h2>
        <p className="text-xs sm:text-sm text-[#766D64] max-w-sm mx-auto leading-relaxed">
          Explore nossos acessórios em aço inox e encontre suas próximas peças favoritas para brilhar em todos os momentos.
        </p>
      </div>

      <div className="pt-2">
        <button
          onClick={onContinueShopping}
          className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-[#2A211B] hover:bg-[#C49A5A] text-white text-xs font-semibold tracking-wider uppercase transition-all cursor-pointer shadow-md"
        >
          <span>Explorar produtos</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
