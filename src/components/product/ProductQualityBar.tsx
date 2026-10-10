import React from 'react';
import { Gem, Droplets, ShieldCheck, Star } from 'lucide-react';

export const ProductQualityBar: React.FC = () => {
  const qualityItems = [
    {
      icon: <Gem className="w-5 h-5 text-[#2A211B] stroke-[1.5]" />,
      title: 'Aço inox de alta qualidade',
      subtitle: 'Não escurece',
    },
    {
      icon: <Droplets className="w-5 h-5 text-[#2A211B] stroke-[1.5]" />,
      title: 'Hipoalergênico',
      subtitle: 'Ideal para peles sensíveis',
    },
    {
      icon: <ShieldCheck className="w-5 h-5 text-[#2A211B] stroke-[1.5]" />,
      title: 'Resistente à água',
      subtitle: 'Mais durabilidade',
    },
    {
      icon: <Star className="w-5 h-5 text-[#2A211B] stroke-[1.5]" />,
      title: 'Design atemporal',
      subtitle: 'Combina com tudo',
    },
  ];

  return (
    <section className="my-10 bg-[#F1E8DC]/40 border-y border-[#E7DED3] py-7">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8">
          {qualityItems.map((item, idx) => (
            <div key={idx} className="flex items-center gap-3.5 text-left">
              <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shrink-0 border border-[#E7DED3] shadow-xs">
                {item.icon}
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-semibold text-[#241F1B] leading-snug">
                  {item.title}
                </h3>
                <p className="text-[11px] text-[#766D64] leading-tight mt-0.5">
                  {item.subtitle}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
