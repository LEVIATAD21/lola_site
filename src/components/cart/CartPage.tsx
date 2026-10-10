import React, { useState } from 'react';
import { ArrowLeft, Trash2, ChevronLeft, ChevronRight, ArrowRight, Heart, Star, ShoppingBag } from 'lucide-react';
import { CartBanner } from './CartBanner';
import { CartItemCard } from './CartItemCard';
import { CartSummaryCard } from './CartSummaryCard';
import { EmptyCartView } from './EmptyCartView';
import { ClearCartModal } from './ClearCartModal';
import { ShippingCalculatorModal, ShippingOption } from './ShippingCalculatorModal';
import { CouponModal } from './CouponModal';
import { WhatsAppModal } from '../product/WhatsAppModal';
import { CartItem } from '../../types';
import { Product, CART_RECOMMENDED_PRODUCTS } from '../../data/mockData';

interface CartPageProps {
  items: CartItem[];
  onUpdateQuantity: (id: string, delta: number) => void;
  onRemoveItem: (id: string) => void;
  onClearCart: () => void;
  onContinueShopping: () => void;
  onSelectProduct: (product: Product) => void;
  favorites: string[];
  onToggleFavorite: (product: Product) => void;
  onAddToCart: (product: Product, quantity: number, size?: string) => void;
  onCheckout: () => void;
  onOpenInfo: (title: string, content: string) => void;
}

export const CartPage: React.FC<CartPageProps> = ({
  items,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  onContinueShopping,
  onSelectProduct,
  favorites,
  onToggleFavorite,
  onAddToCart,
  onCheckout,
  onOpenInfo,
}) => {
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [isShippingModalOpen, setIsShippingModalOpen] = useState(false);
  const [isCouponModalOpen, setIsCouponModalOpen] = useState(false);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);

  // Shipping & Coupon state
  const [appliedShipping, setAppliedShipping] = useState<ShippingOption | null>(null);
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    percentage: number;
  } | null>(null);

  const totalItemsCount = items.reduce((acc, i) => acc + i.quantity, 0);
  const subtotal = items.reduce((acc, i) => acc + i.price * i.quantity, 0);
  const discountAmount = appliedCoupon ? (subtotal * appliedCoupon.percentage) / 100 : 0;
  const shippingPrice = appliedShipping ? appliedShipping.price : null;

  const scrollRef = React.useRef<HTMLDivElement>(null);

  const scrollLeft = () => {
    if (scrollRef.current) scrollRef.current.scrollBy({ left: -300, behavior: 'smooth' });
  };
  const scrollRight = () => {
    if (scrollRef.current) scrollRef.current.scrollBy({ left: 300, behavior: 'smooth' });
  };

  return (
    <div className="bg-[#F8F4ED] min-h-screen text-[#241F1B] pb-16">
      
      {/* 1. Context Banner */}
      <CartBanner />

      {/* 2. Main Cart Area */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-10">
        
        {items.length === 0 ? (
          <EmptyCartView onContinueShopping={onContinueShopping} />
        ) : (
          <div className="space-y-6">
            
            {/* Title & Items Counter */}
            <div className="text-left pb-1">
              <h2 className="font-serif-brand text-2xl sm:text-3xl font-semibold text-[#241F1B] tracking-tight">
                Sua sacola <span className="font-sans text-lg font-normal text-[#766D64]">({totalItemsCount} {totalItemsCount === 1 ? 'item' : 'itens'})</span>
              </h2>
            </div>

            {/* Two-Column Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
              
              {/* Left Column: Items List (lg:col-span-8) */}
              <div className="lg:col-span-8 space-y-4">
                
                {/* Items */}
                <div className="space-y-3.5">
                  {items.map((item) => (
                    <CartItemCard
                      key={item.id}
                      item={item}
                      onUpdateQuantity={onUpdateQuantity}
                      onRemoveItem={onRemoveItem}
                      onSelectProduct={(productId) => {
                        const found = CART_RECOMMENDED_PRODUCTS.find((p) => p.id === productId);
                        if (found) onSelectProduct(found);
                      }}
                    />
                  ))}
                </div>

                {/* Bottom navigation & clear cart row */}
                <div className="flex items-center justify-between pt-4 pb-2 border-t border-[#E7DED3]">
                  <button
                    onClick={onContinueShopping}
                    className="flex items-center gap-2 text-xs sm:text-sm font-medium text-[#241F1B] hover:text-[#C49A5A] transition-colors cursor-pointer group"
                  >
                    <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                    <span>Continuar comprando</span>
                  </button>

                  <button
                    onClick={() => setIsClearModalOpen(true)}
                    className="flex items-center gap-1.5 text-xs text-[#766D64] hover:text-red-600 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Limpar sacola</span>
                  </button>
                </div>

              </div>

              {/* Right Column: Order Summary (lg:col-span-4) */}
              <div className="lg:col-span-4">
                <CartSummaryCard
                  totalItemsCount={totalItemsCount}
                  subtotal={subtotal}
                  shippingPrice={shippingPrice}
                  shippingLabel={appliedShipping?.name}
                  discountAmount={discountAmount}
                  couponCode={appliedCoupon?.code}
                  onOpenShippingModal={() => setIsShippingModalOpen(true)}
                  onOpenCouponModal={() => setIsCouponModalOpen(true)}
                  onCheckout={onCheckout}
                  onOpenWhatsApp={() => setIsWhatsAppModalOpen(true)}
                />
              </div>

            </div>

          </div>
        )}

        {/* 3. "Você também pode gostar" Recommendations Carousel (matching Design 04 screenshot) */}
        <section className="mt-16 sm:mt-20 pt-10 border-t border-[#E7DED3]/70 text-left">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 mb-8">
            <div>
              <h2 className="font-serif-brand text-2xl sm:text-3xl font-semibold text-[#241F1B] tracking-tight">
                Você também pode gostar
              </h2>
              <p className="text-xs sm:text-sm text-[#766D64] mt-1 font-normal">
                Peças que combinam com o que você escolheu.
              </p>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={onContinueShopping}
                className="group inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-[#241F1B] hover:text-[#C49A5A] transition-colors cursor-pointer"
              >
                <span>Ver todos</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
              </button>
            </div>
          </div>

          {/* Carousel */}
          <div className="relative group/carousel">
            
            <button
              onClick={scrollLeft}
              aria-label="Rolar recomendados para esquerda"
              className="absolute -left-3 sm:-left-5 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white shadow-lg border border-[#E7DED3] flex items-center justify-center text-[#2A211B] hover:bg-[#F1E8DC] transition-all cursor-pointer hidden md:flex"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <button
              onClick={scrollRight}
              aria-label="Rolar recomendados para direita"
              className="absolute -right-3 sm:-right-5 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white shadow-lg border border-[#E7DED3] flex items-center justify-center text-[#2A211B] hover:bg-[#F1E8DC] transition-all cursor-pointer hidden md:flex"
            >
              <ChevronRight className="w-5 h-5" />
            </button>

            <div
              ref={scrollRef}
              className="flex gap-4 sm:gap-6 overflow-x-auto pb-4 pt-1 px-1 scroll-smooth no-scrollbar snap-x snap-mandatory"
            >
              {CART_RECOMMENDED_PRODUCTS.map((prod) => {
                const isFav = favorites.includes(prod.id);

                return (
                  <div
                    key={prod.id}
                    className="flex-shrink-0 w-[220px] sm:w-[240px] lg:w-[calc(20%-1.25rem)] snap-start bg-white rounded-2xl overflow-hidden border border-[#E7DED3] hover:border-[#C49A5A]/50 shadow-xs hover:shadow-md transition-all duration-300 flex flex-col group/card text-left"
                  >
                    <div className="relative aspect-square bg-[#F1E8DC] overflow-hidden">
                      <button
                        onClick={() => onSelectProduct(prod)}
                        className="w-full h-full block focus:outline-none cursor-pointer"
                      >
                        <img
                          src={prod.image}
                          alt={prod.name}
                          className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover/card:scale-105"
                          loading="lazy"
                        />
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleFavorite(prod);
                        }}
                        aria-label={isFav ? 'Remover favorito' : 'Favoritar'}
                        className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-white/90 hover:bg-white flex items-center justify-center text-[#2A211B] shadow-xs cursor-pointer z-10"
                      >
                        <Heart
                          className={`w-3.5 h-3.5 ${
                            isFav ? 'fill-[#C49A5A] text-[#C49A5A]' : 'text-[#766D64]'
                          }`}
                        />
                      </button>
                    </div>

                    <div className="p-3.5 flex flex-col flex-1 justify-between gap-3 bg-white">
                      <div className="space-y-1">
                        <h3
                          onClick={() => onSelectProduct(prod)}
                          className="font-medium text-xs sm:text-sm text-[#241F1B] hover:text-[#C49A5A] transition-colors line-clamp-1 cursor-pointer"
                        >
                          {prod.name}
                        </h3>

                        <div className="flex items-center gap-1.5" title="Demonstração visual do catálogo">
                          <div className="flex items-center text-[#C49A5A]">
                            {[...Array(5)].map((_, i) => (
                              <Star key={i} className="w-2.5 h-2.5 fill-[#C49A5A]" />
                            ))}
                          </div>
                        </div>

                        <p className="font-semibold text-sm text-[#241F1B] tabular-nums pt-0.5">
                          R$ {prod.price.toFixed(2).replace('.', ',')}
                        </p>
                      </div>

                      <button
                        onClick={() => onAddToCart(prod, 1)}
                        className="w-full py-2 px-2.5 rounded-xl bg-[#2A211B] hover:bg-[#C49A5A] text-white text-[11px] font-semibold uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <ShoppingBag className="w-3 h-3" />
                        <span>Adicionar à sacola</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

      </div>

      {/* Modals */}
      <ClearCartModal
        isOpen={isClearModalOpen}
        onClose={() => setIsClearModalOpen(false)}
        onConfirm={onClearCart}
      />

      <ShippingCalculatorModal
        isOpen={isShippingModalOpen}
        onClose={() => setIsShippingModalOpen(false)}
        subtotal={subtotal}
        onSelectShipping={(opt) => setAppliedShipping(opt)}
        currentShipping={appliedShipping}
      />

      <CouponModal
        isOpen={isCouponModalOpen}
        onClose={() => setIsCouponModalOpen(false)}
        onApplyCoupon={(code, pct) => setAppliedCoupon({ code, percentage: pct })}
        appliedCoupon={appliedCoupon?.code}
      />

      <WhatsAppModal
        isOpen={isWhatsAppModalOpen}
        onClose={() => setIsWhatsAppModalOpen(false)}
        product={items.length > 0 ? {
          id: 'cart-summary',
          name: `Sacola Lola (${totalItemsCount} itens)`,
          category: 'Brincos',
          price: subtotal + (shippingPrice || 0) - discountAmount,
          image: items[0].image,
          description: '',
          isFeatured: false,
        } : null}
      />

    </div>
  );
};
