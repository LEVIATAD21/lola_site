import React from 'react';
import { Check, AlertCircle } from 'lucide-react';

interface BadgeEstoqueProps {
  availableUnits?: boolean | null;
  showDetailed?: boolean;
  className?: string;
}

export const BadgeEstoque: React.FC<BadgeEstoqueProps> = ({
  availableUnits,
  className = '',
}) => {
  if (availableUnits === undefined || availableUnits === null) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-stone-100 text-stone-600 border border-stone-200 select-none ${className}`}
        aria-label="Disponibilidade sob consulta"
      >
        <span>Consulte disponibilidade</span>
      </span>
    );
  }

  if (!availableUnits) {
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

  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200/70 select-none ${className}`}
      aria-label="Produto disponível"
    >
      <Check className="w-3 h-3 text-emerald-600 stroke-[2.5]" />
      <span>Em estoque</span>
    </span>
  );
};
