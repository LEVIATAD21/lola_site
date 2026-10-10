import React from 'react';
import { Truck, ShieldCheck, CreditCard, Headphones, Sparkles } from 'lucide-react';
import { BENEFITS, Benefit } from '../data/mockData';

interface BenefitsStripProps {
  onOpenBenefitInfo: (benefit: Benefit) => void;
}

export const BenefitsStrip: React.FC<BenefitsStripProps> = ({ onOpenBenefitInfo }) => {
  const getIcon = (iconName: Benefit['iconName']) => {
    switch (iconName) {
      case 'truck':
        return <Truck className="w-6 h-6 stroke-[1.5]" />;
      case 'shield':
        return <ShieldCheck className="w-6 h-6 stroke-[1.5]" />;
      case 'creditCard':
        return <CreditCard className="w-6 h-6 stroke-[1.5]" />;
      case 'headset':
        return <Headphones className="w-6 h-6 stroke-[1.5]" />;
      case 'heart':
      default:
        return <Sparkles className="w-6 h-6 stroke-[1.5]" />;
    }
  };

  return (
    <section className="py-10 bg-[#F1E8DC]/40 border-y border-[#E7DED3]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6 sm:gap-8">
          {BENEFITS.map((benefit) => (
            <button
              key={benefit.id}
              onClick={() => onOpenBenefitInfo(benefit)}
              className="flex flex-col items-center text-center p-3 rounded-xl hover:bg-white/80 transition-all duration-200 group cursor-pointer focus:outline-none"
            >
              <div className="text-[#2A211B] group-hover:text-[#C49A5A] group-hover:scale-110 transition-transform duration-200 mb-3">
                {getIcon(benefit.iconName)}
              </div>
              <h3 className="text-xs sm:text-sm font-semibold text-[#241F1B] leading-tight mb-1">
                {benefit.title}
              </h3>
              <p className="text-[11px] sm:text-xs text-[#766D64] leading-normal">
                {benefit.description}
              </p>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};
