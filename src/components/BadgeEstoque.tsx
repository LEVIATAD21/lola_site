import React from 'react';
import { Check, Flame, AlertCircle } from 'lucide-react';

interface BadgeEstoqueProps {
  availableUnits: number;
  showDetailed?: boolean;
  className?: string;
}

export const BadgeEstoque: React.FC<BadgeEstoqueProps> = ({
  availableUnits,
  showDetailed = true,
  className = '',
}) => {
  if (availableUnits <= 0) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-stone-100 text-stone-600 border border-stone-200 select-none ${className}`}
        aria-label="Produto esgotado"
      >
        <AlertCircle className="w-3 h-3 text-stone-500" />
        <span>Esgotado</span>
      </span>
    );
  }

  if (availableUnits <= 4) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-900 border border-amber-200/80 animate-pulse select-none ${className}`}
        aria-label={`Restam apenas ${availableUnits} unidades em estoque`}
      >
        <Flame className="w-3 h-3 text-amber-600 fill-amber-500" />
        <span>
          {showDetailed
            ? `Restam apenas ${availableUnits} un.!`
            : `Últimas ${availableUnits} un.`}
        </span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200/70 select-none ${className}`}
      aria-label={`${availableUnits} unidades disponíveis em estoque`}
    >
      <Check className="w-3 h-3 text-emerald-600 stroke-[2.5]" />
      <span>
        {showDetailed
          ? `${availableUnits} unidades disponíveis`
          : 'Em estoque'}
      </span>
    </span>
  );
};
