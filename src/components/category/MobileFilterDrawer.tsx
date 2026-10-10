import React from 'react';
import { X, RotateCcw, Check } from 'lucide-react';
import { FilterSidebar, FilterState } from './FilterSidebar';

interface MobileFilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  onReset: () => void;
  totalFilteredCount: number;
  counts: {
    types: Record<string, number>;
    priceRanges: Record<string, number>;
    colors: Record<string, number>;
    materials: Record<string, number>;
  };
}

export const MobileFilterDrawer: React.FC<MobileFilterDrawerProps> = ({
  isOpen,
  onClose,
  filters,
  onChange,
  onReset,
  totalFilteredCount,
  counts,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden lg:hidden" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-sm bg-white shadow-2xl flex flex-col">
          
          {/* Header */}
          <div className="p-4 border-b border-[#E7DED3] flex items-center justify-between bg-[#F8F4ED]">
            <h3 className="font-serif-brand text-lg font-semibold text-[#241F1B]">
              Filtrar Brincos
            </h3>
            <button
              onClick={onClose}
              aria-label="Fechar filtros"
              className="p-1.5 text-[#766D64] hover:text-[#2A211B] rounded-full hover:bg-black/5 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5">
            <FilterSidebar
              filters={filters}
              onChange={onChange}
              onReset={onReset}
              counts={counts}
            />
          </div>

          {/* Footer with Apply button */}
          <div className="p-4 border-t border-[#E7DED3] bg-[#F8F4ED] space-y-2">
            <button
              onClick={onClose}
              className="w-full py-3 px-4 rounded-xl bg-[#2A211B] hover:bg-[#C49A5A] text-white text-xs font-semibold uppercase tracking-wider transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-md"
            >
              <Check className="w-4 h-4" />
              <span>Ver {totalFilteredCount} produtos</span>
            </button>
            <button
              onClick={onReset}
              className="w-full py-2 text-center text-xs text-[#766D64] hover:text-[#2A211B] flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Limpar todos os filtros</span>
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};
