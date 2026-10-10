import React from 'react';
import { Trash2 } from 'lucide-react';
import { CartItem } from '../../types';

interface CartItemCardProps {
  item: CartItem;
  onUpdateQuantity: (id: string, delta: number) => void;
  onRemoveItem: (id: string) => void;
  onSelectProduct?: (productId: string) => void;
}

export const CartItemCard: React.FC<CartItemCardProps> = ({
  item,
  onUpdateQuantity,
  onRemoveItem,
  onSelectProduct,
}) => {
  const lineSubtotal = item.price * item.quantity;

  return (
    <div className="bg-white rounded-2xl p-4 sm:p-5 border border-[#E7DED3] shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all hover:border-[#C49A5A]/40">
      
      {/* Left side: Thumbnail & Product details */}
      <div className="flex items-center gap-4 min-w-0 flex-1">
        
        {/* Thumbnail */}
        <div
          onClick={() => onSelectProduct && onSelectProduct(item.productId)}
          className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden bg-[#F1E8DC] border border-[#E7DED3] shrink-0 cursor-pointer group"
        >
          <img
            src={item.image}
            alt={item.name}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        </div>

        {/* Info */}
        <div className="space-y-1 min-w-0 text-left">
          <h3
            onClick={() => onSelectProduct && onSelectProduct(item.productId)}
            className="font-medium text-sm sm:text-base text-[#241F1B] hover:text-[#C49A5A] transition-colors truncate cursor-pointer"
            title={item.name}
          >
            {item.name}
          </h3>

          {/* Attributes */}
          <div className="text-[11px] sm:text-xs text-[#766D64] space-y-0.5">
            <p>{item.material || 'Aço inox'} • {item.color || 'Dourado'}</p>
            {item.variant ? (
              <p>{item.variant.startsWith('Tamanho:') ? item.variant : `Tamanho: ${item.variant}`}</p>
            ) : (
              <p>Tamanho: Único</p>
            )}
          </div>

          {/* Unit price */}
          <p className="font-semibold text-xs sm:text-sm text-[#241F1B] tabular-nums pt-0.5">
            R$ {item.price.toFixed(2).replace('.', ',')}
          </p>
        </div>

      </div>

      {/* Middle & Right: In stock badge, Stepper, Subtotal, Trash */}
      <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-6 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-[#E7DED3]/60">
        
        {/* Badge: Em estoque */}
        <span className="hidden md:inline-block px-2.5 py-1 rounded-full bg-[#E6F4EA] text-[#137333] text-[10px] font-semibold tracking-wide shrink-0">
          Em estoque
        </span>

        {/* Stepper [ - ] 1 [ + ] */}
        <div className="flex items-center border border-[#E7DED3] rounded-xl bg-[#F8F4ED]/60 overflow-hidden shrink-0">
          <button
            onClick={() => onUpdateQuantity(item.id, -1)}
            disabled={item.quantity <= 1}
            aria-label={`Diminuir quantidade de ${item.name}`}
            className="w-8 h-8 flex items-center justify-center text-xs font-semibold text-[#766D64] hover:text-[#2A211B] hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            −
          </button>
          <span className="w-8 text-center text-xs font-bold tabular-nums text-[#241F1B]">
            {item.quantity}
          </span>
          <button
            onClick={() => onUpdateQuantity(item.id, 1)}
            aria-label={`Aumentar quantidade de ${item.name}`}
            className="w-8 h-8 flex items-center justify-center text-xs font-semibold text-[#766D64] hover:text-[#2A211B] hover:bg-white cursor-pointer transition-colors"
          >
            +
          </button>
        </div>

        {/* Line Subtotal */}
        <div className="text-right shrink-0 min-w-[70px]">
          <span className="font-semibold text-sm sm:text-base text-[#241F1B] tabular-nums">
            R$ {lineSubtotal.toFixed(2).replace('.', ',')}
          </span>
        </div>

        {/* Trash delete button */}
        <button
          onClick={() => onRemoveItem(item.id)}
          aria-label={`Remover ${item.name} da sacola`}
          className="p-1.5 text-[#766D64] hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer shrink-0"
          title="Remover item"
        >
          <Trash2 className="w-4 h-4" />
        </button>

      </div>

    </div>
  );
};
