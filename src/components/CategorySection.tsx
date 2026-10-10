import React from 'react';
import { ArrowRight } from 'lucide-react';
import { CATEGORIES, Category } from '../data/mockData';

interface CategorySectionProps {
  onSelectCategory: (categorySlug: string) => void;
  onViewAllCategories: () => void;
}

export const CategorySection: React.FC<CategorySectionProps> = ({
  onSelectCategory,
  onViewAllCategories,
}) => {
  return (
    <section id="categorias" className="py-12 sm:py-16 bg-[#F8F4ED]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Heading Bar */}
        <div className="flex items-center justify-between mb-8 sm:mb-10">
          <div>
            <h2 className="font-serif-brand text-2xl sm:text-3xl font-semibold text-[#241F1B] tracking-tight">
              Escolha pelo seu estilo
            </h2>
          </div>
          
          <button
            onClick={onViewAllCategories}
            className="group inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-[#241F1B] hover:text-[#C49A5A] transition-colors cursor-pointer"
          >
            <span>Ver todas</span>
            <ArrowRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-1" />
          </button>
        </div>

        {/* 5 Category Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 sm:gap-6">
          {CATEGORIES.map((category: Category) => (
            <button
              key={category.id}
              onClick={() => onSelectCategory(category.slug)}
              className="group flex flex-col bg-white rounded-2xl overflow-hidden border border-[#E7DED3] hover:border-[#C49A5A]/50 shadow-sm hover:shadow-md transition-all duration-300 text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#C49A5A]"
            >
              {/* Image Container with aspect-ratio 4:3 or square */}
              <div className="relative w-full aspect-[4/3] bg-[#F1E8DC] overflow-hidden">
                <img
                  src={category.image}
                  alt={`Categoria ${category.name}`}
                  className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors" />
              </div>

              {/* Card Label and Navigation Indicator */}
              <div className="flex items-center justify-between p-3 sm:p-4 bg-white">
                <div>
                  <span className="font-medium text-xs sm:text-sm text-[#241F1B] group-hover:text-[#C49A5A] transition-colors">
                    {category.name}
                  </span>
                </div>
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[#766D64] group-hover:text-[#2A211B] group-hover:translate-x-1 transition-all">
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </button>
          ))}
        </div>

      </div>
    </section>
  );
};
