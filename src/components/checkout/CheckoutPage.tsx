import React, { useState } from 'react';
import { CheckoutStepper } from './CheckoutStepper';
import { CheckoutAddressForm, CheckoutAddressData, CheckoutAddressErrors } from './CheckoutAddressForm';
import { CheckoutPaymentMethod, PaymentData } from './CheckoutPaymentMethod';
import { CheckoutOrderSummary } from './CheckoutOrderSummary';
import { OrderSuccessModal } from './OrderSuccessModal';
import { WhatsAppModal } from '../product/WhatsAppModal';
import { ProductEditorialBanner } from '../product/ProductEditorialBanner';
import { CartItem, AppliedCoupon } from '../../types';
import { Product, CART_RECOMMENDED_PRODUCTS } from '../../data/mockData';
import { getCouponDiscount, getCouponPercentage } from '../../data/coupons';
import { ShippingOption, quoteShipping } from '../cart/ShippingCalculatorModal';
import { validateAddress } from '../../utils/checkoutValidation';
import { ChevronLeft, ChevronRight, Heart, ArrowRight } from 'lucide-react';

interface CheckoutPageProps {
  items: CartItem[];
  onRemoveItem: (id: string) => void;
  onClearCart: () => void;
  onBackToCart: () => void;
  onGoToAccount: () => void;
  onContinueShopping: () => void;
  onSelectProduct: (product: Product) => void;
  favorites: string[];
  onToggleFavorite: (product: Product) => void;
  onAddToCart: (product: Product, quantity: number, size?: string) => void;
  onOrderCompleted?: (orderData: any) => void;
  coupon: AppliedCoupon | null;
  onApplyCoupon: (code: string, percentage: number) => void;
  shipping: ShippingOption | null;
  onOpenInfo?: (title: string, content: string) => void;
}

export const CheckoutPage: React.FC<CheckoutPageProps> = ({
  items,
  onRemoveItem,
  onClearCart,
  onBackToCart,
  onGoToAccount,
  onContinueShopping,
  onSelectProduct,
  favorites,
  onToggleFavorite,
  onAddToCart,
  onOrderCompleted,
  coupon,
  onApplyCoupon,
  shipping,
  onOpenInfo,
}) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [hasGiftWrap, setHasGiftWrap] = useState(false);
  const [termsError, setTermsError] = useState(false);
  const [addressErrors, setAddressErrors] = useState<CheckoutAddressErrors>({});
  const [cepNotice, setCepNotice] = useState<string | null>(null);

  // Address form state starts empty
  const [addressData, setAddressData] = useState<CheckoutAddressData>({
    fullName: '',
    phone: '',
    cep: '',
    street: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
    saveAddress: false,
  });

  // Payment form state starts empty without pre-filled card or fake data
  const [paymentData, setPaymentData] = useState<PaymentData>({
    method: 'credit_card',
    cardNumber: '',
    cardName: '',
    cardExpiry: '',
    cardCvv: '',
    installments: 1,
    acceptedTerms: false,
  });

  const subtotal = items.reduce((acc, i) => acc + i.price * i.quantity, 0);
  const discountAmount = getCouponDiscount(coupon?.code, subtotal);
  // Frete escolhido no carrinho é reaproveitado e recalculado para o subtotal atual;
  // sem escolha prévia, usa a estimativa demonstrativa padrão.
  const shippingPrice = shipping ? quoteShipping(shipping.id, subtotal) : subtotal >= 150 ? 0 : 19.90;
  const giftWrapPrice = hasGiftWrap ? 9.90 : 0;
  const totalAmount = Math.max(0, subtotal + shippingPrice + giftWrapPrice - discountAmount);

  const scrollRef = React.useRef<HTMLDivElement>(null);

  const scrollLeft = () => {
    if (scrollRef.current) scrollRef.current.scrollBy({ left: -300, behavior: 'smooth' });
  };
  const scrollRight = () => {
    if (scrollRef.current) scrollRef.current.scrollBy({ left: 300, behavior: 'smooth' });
  };

  const handleCepSearch = (_cleanCep: string) => {
    // Nenhuma consulta é realizada nesta demonstração — o feedback abaixo evita
    // que a ação pareça ter concluído uma busca que não existe.
    setCepNotice(
      'Consulta automática de CEP indisponível nesta demonstração. Preencha o endereço manualmente.'
    );
  };

  const handleApplyCoupon = (code: string): boolean => {
    const clean = code.trim().toUpperCase();
    const pct = getCouponPercentage(clean);
    if (!pct) return false;
    onApplyCoupon(clean, pct);
    return true;
  };

  const handleSubmitOrder = () => {
    const errs = validateAddress(addressData);
    setAddressErrors(errs);
    if (Object.keys(errs).length > 0) {
      setTermsError(false);
      setCurrentStep(2);
      const form = document.querySelector('section, div.bg-white');
      form?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (!paymentData.acceptedTerms) {
      setTermsError(true);
      setCurrentStep(3);
      return;
    }
    setTermsError(false);
    setCurrentStep(4);
    setIsSuccessModalOpen(true);
    // Não chama onOrderCompleted nem simula pedido real
  };

  return (
    <div className="bg-[#F8F4ED] min-h-screen text-[#241F1B] pb-16">
      
      {/* 1. Checkout Context Banner */}
      <section className="relative w-full overflow-hidden bg-[#2A211B] min-h-[220px] sm:min-h-[260px] flex items-center">
        <div className="absolute inset-0 z-0">
          <img
            src="/images/cart_banner_jewelry_1791585126765.jpg"
            alt="Joias Lola Checkout"
            className="w-full h-full object-cover object-[center_35%]"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#2A211B]/95 via-[#2A211B]/70 to-[#2A211B]/30" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full py-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            <div className="lg:col-span-8 space-y-2 text-left">
              <span className="text-[10px] sm:text-xs font-semibold tracking-[0.25em] text-[#C49A5A] uppercase block">
                FINALIZAR COMPRA
              </span>
              <h1 className="font-serif-brand text-3xl sm:text-4xl lg:text-5xl font-normal text-white leading-tight tracking-tight drop-shadow-sm">
                Checkout
              </h1>
              <p className="text-white/85 text-xs sm:text-sm font-light max-w-lg leading-relaxed">
                Preencha seus dados e escolha a melhor forma de pagamento.
              </p>
            </div>

            <div className="hidden lg:flex lg:col-span-4 justify-end items-center pr-2">
              <div className="text-right space-y-1.5 animate-in fade-in duration-500">
                <p className="font-script text-2xl xl:text-3xl text-[#F8F4ED] drop-shadow leading-snug select-none">
                  Mais que acessórios, é sobre você! ♡
                </p>
                <div className="w-24 h-[1px] bg-[#DCC7B0]/60 ml-auto" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. 4-Step Progress Indicator */}
      <CheckoutStepper currentStep={currentStep} onStepClick={setCurrentStep} />

      {/* 3. Main 2-Column Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
          
          {/* Left Column: Delivery Address + Payment Method (lg:col-span-7 xl:col-span-8) */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-8">
            
            {/* Step 1: Address Form */}
            <CheckoutAddressForm
              data={addressData}
              errors={addressErrors}
              notice={cepNotice}
              onChange={(data) => {
                setAddressData(data);
                if (Object.keys(addressErrors).length > 0) setAddressErrors({});
              }}
              onCepSearch={handleCepSearch}
            />

            {/* Step 2: Payment Method */}
            <CheckoutPaymentMethod
              paymentData={paymentData}
              onChange={(data) => {
                setPaymentData(data);
                if (data.acceptedTerms) setTermsError(false);
              }}
              totalAmount={totalAmount}
              onBackToCart={onBackToCart}
              onSubmitOrder={handleSubmitOrder}
              termsError={termsError}
              onOpenInfo={onOpenInfo}
            />

          </div>

          {/* Right Column: Order Summary + Gift Box (lg:col-span-5 xl:col-span-4) */}
          <div className="lg:col-span-5 xl:col-span-4 sticky top-28">
            <CheckoutOrderSummary
              items={items}
              subtotal={subtotal}
              shippingPrice={shippingPrice}
              shippingLabel={shipping?.name}
              discountAmount={discountAmount}
              appliedCoupon={coupon?.code ?? null}
              onApplyCoupon={handleApplyCoupon}
              onRemoveItem={onRemoveItem}
              onFinalizeOrder={handleSubmitOrder}
              onOpenWhatsApp={() => setIsWhatsAppModalOpen(true)}
              hasGiftWrap={hasGiftWrap}
              onToggleGiftWrap={() => setHasGiftWrap(!hasGiftWrap)}
            />
          </div>

        </div>

        {/* 4. "Você também pode gostar" Recommendations */}
        <section className="mt-16 pt-10 border-t border-[#E7DED3]/70 text-left">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 mb-8">
            <div>
              <h2 className="font-serif-brand text-2xl sm:text-3xl font-semibold text-[#241F1B] tracking-tight">
                Você também pode gostar
              </h2>
              <p className="text-xs sm:text-sm text-[#766D64] mt-1 font-normal">
                Produtos que combinam com o seu pedido.
              </p>
            </div>

            <button
              onClick={onContinueShopping}
              className="group inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-[#241F1B] hover:text-[#C49A5A] transition-colors cursor-pointer"
            >
              <span>Ver todos</span>
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
            </button>
          </div>

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

                        <p className="font-semibold text-sm text-[#241F1B] tabular-nums pt-0.5">
                          R$ {prod.price.toFixed(2).replace('.', ',')}
                        </p>
                      </div>

                      <button
                        onClick={() => onSelectProduct(prod)}
                        className="w-full py-2 px-2.5 rounded-xl bg-[#F8F4ED] hover:bg-[#F1E8DC] text-[#241F1B] text-[11px] font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer border border-[#E7DED3]"
                      >
                        <span>Ver produto</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* 5. Editorial Brand Banner */}
        <ProductEditorialBanner
          onOpenWhatsApp={() => setIsWhatsAppModalOpen(true)}
        />

      </div>

      {/* Modals */}
      <OrderSuccessModal
        isOpen={isSuccessModalOpen}
        totalAmount={totalAmount}
        paymentMethod={paymentData.method}
        onGoToAccount={() => {
          setIsSuccessModalOpen(false);
          onGoToAccount();
        }}
        onContinueShopping={() => {
          setIsSuccessModalOpen(false);
          onContinueShopping();
        }}
      />

      <WhatsAppModal
        isOpen={isWhatsAppModalOpen}
        onClose={() => setIsWhatsAppModalOpen(false)}
        product={{
          id: 'checkout-summary',
          name: `Pedido Checkout Lola (${items.length} itens)`,
          category: 'Brincos',
          price: totalAmount,
          image: items[0]?.image || '/images/product_earrings_1791578709776.jpg',
          description: '',
          isFeatured: false,
        }}
      />

    </div>
  );
};
