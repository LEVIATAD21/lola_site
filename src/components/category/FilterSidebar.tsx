import React, { useState } from 'react';
import { ChevronUp, ChevronDown, RotateCcw } from 'lucide-react';

export interface FilterState {
  category: string; // 'all' or specific type like 'Argolas'
  priceRange: string[]; // ['under-30', '30-60', '60-90', '90-130', 'over-130']
  colors: string[]; // ['Dourado', 'Prateado', ...]
  materials: string[]; // ['Aço inox', 'Aço cirúrgico', ...]
}

interface FilterSidebarProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  onReset: () => void;
  counts: {
    types: Record<string, number>;
    priceRanges: Record<string, number>;
    colors: Record<string, number>;
    materials: Record<string, number>;
  };
}

export const FilterSidebar: React.FC<FilterSidebarProps> = ({
  filters,
  onChange,
  onReset,
  counts,
}) => {
  const [openSections, setOpenSections] = useState({
    category: true,
    price: true,
    color: true,
    material: true,
  });

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const handleCategorySelect = (type: string) => {
    onChange({
      ...filters,
      category: type,
    });
  };

  const handlePriceToggle = (range: string) => {
    const isSelected = filters.priceRange.includes(range);
    const updated = isSelected
      ? filters.priceRange.filter((r) => r !== range)
      : [...filters.priceRange, range];
    onChange({ ...filters, priceRange: updated });
  };

  const handleColorToggle = (color: string) => {
    const isSelected = filters.colors.includes(color);
    const updated = isSelected
      ? filters.colors.filter((c) => c !== color)
      : [...filters.colors, color];
    onChange({ ...filters, colors: updated });
  };

  const handleMaterialToggle = (material: string) => {
    const isSelected = filters.materials.includes(material);
    const updated = isSelected
      ? filters.materials.filter((m) => m !== material)
      : [...filters.materials, material];
    onChange({ ...filters, materials: updated });
  };

  // Contagens reais, inclusive zero: quando o total é 0 a barra mostra (0) em
  // vez de inventar número. Nenhuma opção é ocultada — o filtro não pode se
  // reconfigurar sozinho nem anunciar peça onde não há.
  const categoryOptions = [
    { label: 'Todos os brincos', value: 'all', count: counts.types.all ?? 0 },
    { label: 'Argolas', value: 'Argolas', count: counts.types['Argolas'] ?? 0 },
    { label: 'Pontos de luz', value: 'Pontos de luz', count: counts.types['Pontos de luz'] ?? 0 },
    { label: 'Ear cuffs', value: 'Ear cuffs', count: counts.types['Ear cuffs'] ?? 0 },
    { label: 'Estilo minimalista', value: 'Estilo minimalista', count: counts.types['Estilo minimalista'] ?? 0 },
    { label: 'Com pedras', value: 'Com pedras', count: counts.types['Com pedras'] ?? 0 },
    { label: 'Tendências', value: 'Tendências', count: counts.types['Tendências'] ?? 0 },
  ];

  const priceOptions = [
    { label: 'Até R$ 29,90', value: 'under-30', count: counts.priceRanges['under-30'] ?? 0 },
    { label: 'R$ 30,00 - R$ 59,90', value: '30-60', count: counts.priceRanges['30-60'] ?? 0 },
    { label: 'R$ 60,00 - R$ 89,90', value: '60-90', count: counts.priceRanges['60-90'] ?? 0 },
    { label: 'R$ 90,00 - R$ 129,90', value: '90-130', count: counts.priceRanges['90-130'] ?? 0 },
    { label: 'Acima de R$ 130,00', value: 'over-130', count: counts.priceRanges['over-130'] ?? 0 },
  ];

  const colorOptions = [
    { label: 'Dourado', value: 'Dourado', colorHex: '#C49A5A', count: counts.colors['Dourado'] ?? 0 },
    { label: 'Prateado', value: 'Prateado', colorHex: '#9CA3AF', count: counts.colors['Prateado'] ?? 0 },
    { label: 'Rosé', value: 'Rosé', colorHex: '#E0A899', count: counts.colors['Rosé'] ?? 0 },
    { label: 'Preto', value: 'Preto', colorHex: '#1F2937', count: counts.colors['Preto'] ?? 0 },
    { label: 'Colorido', value: 'Colorido', colorHex: 'rainbow', count: counts.colors['Colorido'] ?? 0 },
  ];

  const materialOptions = [
    { label: 'Aço inox', value: 'Aço inox', count: counts.materials['Aço inox'] ?? 0 },
    { label: 'Aço cirúrgico', value: 'Aço cirúrgico', count: counts.materials['Aço cirúrgico'] ?? 0 },
    { label: 'Com zircônia', value: 'Com zircônia', count: counts.materials['Com zircônia'] ?? 0 },
    { label: 'Pérola artificial', value: 'Pérola artificial', count: counts.materials['Pérola artificial'] ?? 0 },
  ];

  const hasActiveFilters =
    filters.category !== 'all' ||
    filters.priceRange.length > 0 ||
    filters.colors.length > 0 ||
    filters.materials.length > 0;

  return (
    <aside className="w-full space-y-6 text-[#241F1B]">
      
      {/* Title */}
      <div className="flex items-center justify-between pb-3 border-b border-[#E7DED3]">
        <h2 className="font-serif-brand text-lg font-semibold text-[#241F1B]">
          Filtros
        </h2>
        {hasActiveFilters && (
          <button
            onClick={onReset}
            className="text-xs text-[#C49A5A] hover:underline font-medium cursor-pointer"
          >
            Limpar tudo
          </button>
        )}
      </div>

      {/* 1. Accordion Categoria */}
      <div className="pb-5 border-b border-[#E7DED3]">
        <button
          onClick={() => toggleSection('category')}
          className="w-full flex items-center justify-between py-1 text-xs sm:text-sm font-semibold text-[#241F1B] hover:text-[#C49A5A] transition-colors cursor-pointer"
          aria-expanded={openSections.category}
        >
          <span>Categoria</span>
          {openSections.category ? (
            <ChevronUp className="w-4 h-4 text-[#766D64]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[#766D64]" />
          )}
        </button>

        {openSections.category && (
          <div className="mt-3 space-y-2 text-xs">
            {categoryOptions.map((opt) => {
              const isChecked = filters.category === opt.value;

              return (
                <label
                  key={opt.value}
                  className="flex items-center justify-between group cursor-pointer select-none py-0.5"
                >
                  <div className="flex items-center gap-2.5">
                    <input
                      type="radio"
                      name="filter_category"
                      checked={isChecked}
                      onChange={() => handleCategorySelect(opt.value)}
                      className="w-3.5 h-3.5 accent-[#2A211B] text-[#2A211B] rounded border-[#E7DED3] cursor-pointer"
                    />
                    <span
                      className={`transition-colors ${
                        isChecked ? 'font-semibold text-[#2A211B]' : 'text-[#766D64] group-hover:text-[#241F1B]'
                      }`}
                    >
                      {opt.label}
                    </span>
                  </div>
                  {opt.value !== 'all' && (
                    <span className="text-[11px] text-[#766D64]/80 tabular-nums">
                      ({opt.count})
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. Accordion Faixa de preço */}
      <div className="pb-5 border-b border-[#E7DED3]">
        <button
          onClick={() => toggleSection('price')}
          className="w-full flex items-center justify-between py-1 text-xs sm:text-sm font-semibold text-[#241F1B] hover:text-[#C49A5A] transition-colors cursor-pointer"
          aria-expanded={openSections.price}
        >
          <span>Faixa de preço</span>
          {openSections.price ? (
            <ChevronUp className="w-4 h-4 text-[#766D64]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[#766D64]" />
          )}
        </button>

        {openSections.price && (
          <div className="mt-3 space-y-2 text-xs">
            {priceOptions.map((opt) => {
              const isChecked = filters.priceRange.includes(opt.value);

              return (
                <label
                  key={opt.value}
                  className="flex items-center justify-between group cursor-pointer select-none py-0.5"
                >
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handlePriceToggle(opt.value)}
                      className="w-3.5 h-3.5 accent-[#2A211B] text-[#2A211B] rounded border-[#E7DED3] cursor-pointer"
                    />
                    <span
                      className={`transition-colors ${
                        isChecked ? 'font-semibold text-[#2A211B]' : 'text-[#766D64] group-hover:text-[#241F1B]'
                      }`}
                    >
                      {opt.label}
                    </span>
                  </div>
                  <span className="text-[11px] text-[#766D64]/80 tabular-nums">
                    {opt.count}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. Accordion Cor */}
      <div className="pb-5 border-b border-[#E7DED3]">
        <button
          onClick={() => toggleSection('color')}
          className="w-full flex items-center justify-between py-1 text-xs sm:text-sm font-semibold text-[#241F1B] hover:text-[#C49A5A] transition-colors cursor-pointer"
          aria-expanded={openSections.color}
        >
          <span>Cor</span>
          {openSections.color ? (
            <ChevronUp className="w-4 h-4 text-[#766D64]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[#766D64]" />
          )}
        </button>

        {openSections.color && (
          <div className="mt-3 space-y-2 text-xs">
            {colorOptions.map((opt) => {
              const isChecked = filters.colors.includes(opt.value);

              return (
                <label
                  key={opt.value}
                  className="flex items-center justify-between group cursor-pointer select-none py-0.5"
                >
                  <div className="flex items-center gap-2.5">
                    {opt.colorHex === 'rainbow' ? (
                      <span className="w-3.5 h-3.5 rounded-full bg-gradient-to-tr from-pink-500 via-amber-400 to-indigo-500 shrink-0 border border-black/10" />
                    ) : (
                      <span
                        className="w-3.5 h-3.5 rounded-full shrink-0 border border-black/10"
                        style={{ backgroundColor: opt.colorHex }}
                      />
                    )}
                    <span
                      className={`transition-colors ${
                        isChecked ? 'font-semibold text-[#2A211B]' : 'text-[#766D64] group-hover:text-[#241F1B]'
                      }`}
                    >
                      {opt.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-[#766D64]/80 tabular-nums">
                      {opt.count}
                    </span>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleColorToggle(opt.value)}
                      className="w-3 h-3 accent-[#2A211B] cursor-pointer"
                    />
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. Accordion Material */}
      <div className="pb-5 border-b border-[#E7DED3]">
        <button
          onClick={() => toggleSection('material')}
          className="w-full flex items-center justify-between py-1 text-xs sm:text-sm font-semibold text-[#241F1B] hover:text-[#C49A5A] transition-colors cursor-pointer"
          aria-expanded={openSections.material}
        >
          <span>Material</span>
          {openSections.material ? (
            <ChevronUp className="w-4 h-4 text-[#766D64]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[#766D64]" />
          )}
        </button>

        {openSections.material && (
          <div className="mt-3 space-y-2 text-xs">
            {materialOptions.map((opt) => {
              const isChecked = filters.materials.includes(opt.value);

              return (
                <label
                  key={opt.value}
                  className="flex items-center justify-between group cursor-pointer select-none py-0.5"
                >
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleMaterialToggle(opt.value)}
                      className="w-3.5 h-3.5 accent-[#2A211B] text-[#2A211B] rounded border-[#E7DED3] cursor-pointer"
                    />
                    <span
                      className={`transition-colors ${
                        isChecked ? 'font-semibold text-[#2A211B]' : 'text-[#766D64] group-hover:text-[#241F1B]'
                      }`}
                    >
                      {opt.label}
                    </span>
                  </div>
                  <span className="text-[11px] text-[#766D64]/80 tabular-nums">
                    {opt.count}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Button Limpar filtros matching reference */}
      <button
        onClick={onReset}
        disabled={!hasActiveFilters}
        className={`w-full py-2.5 px-4 rounded-xl border border-[#E7DED3] text-xs font-medium transition-all flex items-center justify-center gap-2 cursor-pointer ${
          hasActiveFilters
            ? 'bg-white hover:bg-[#F1E8DC] text-[#241F1B] shadow-xs'
            : 'bg-[#F8F4ED] text-[#766D64]/60 cursor-not-allowed border-dashed'
        }`}
      >
        <RotateCcw className="w-3.5 h-3.5" />
        <span>Limpar filtros</span>
      </button>

    </aside>
  );
};
