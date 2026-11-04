import React, { useState, useEffect } from 'react';
import { ChevronRight } from 'lucide-react';
import { ProductGallery } from './ProductGallery';
import { ProductPurchasePanel } from './ProductPurchasePanel';
import { ProductQualityBar } from './ProductQualityBar';
import { ProductDetailsSection } from './ProductDetailsSection';
import { RelatedProductsSection } from './RelatedProductsSection';
import { ProductEditorialBanner } from './ProductEditorialBanner';
import { WhatsAppModal } from './WhatsAppModal';
import { ProductLightboxModal } from './ProductLightboxModal';
import { Product, EARRINGS_CATALOG, FEATURED_PRODUCTS } from '../../data/mockData';
import { getProductStock } from '../../services/api';

interface ProductDetailPageProps {
  product: Product;
  onNavigateHome: () => void;
  onNavigateCategories: () => void;
  onNavigateEarrings: () => void;
  favorites: string[];
  onToggleFavorite: (product: Product) => void;
  onAddToCart: (product: Product, quantity: number, size?: string) => void;
  onSelectProduct: (product: Product) => void;
  onOpenInfo: (title: string, content: string) => void;
}

export const ProductDetailPage: React.FC<ProductDetailPageProps> = ({
  product,
  onNavigateHome,
  onNavigateCategories,
  onNavigateEarrings,
  favorites,
  onToggleFavorite,
  onAddToCart,
  onSelectProduct,
  onOpenInfo,
}) => {
  const [selectedSize, setSelectedSize] = useState<string>('P (1,5 cm)');
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [isGlobalLightboxOpen, setIsGlobalLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [stockUnits, setStockUnits] = useState<boolean | null>(null);

  useEffect(() => {
    let isMounted = true;
    getProductStock(product.id).then((res) => {
      if (isMounted) setStockUnits(res ? res.disponivel : null);
    });
    return () => {
      isMounted = false;
    };
  }, [product.id]);

  // 5 Gallery images matching Design 03 reference
  const galleryImages = [
    product.image || '/images/product_earrings_1791578709776.jpg',
    '/images/hero_lola_model_1791578690867.jpg',
    '/images/hoop_angle_view_1791584253619.jpg',
    '/images/hero_lola_model_1791578690867.jpg',
    '/images/hoop_flatlay_linen_1791584262407.jpg',
  ];

  // Related Products for recommendations carousel respecting category
  const allProducts = [...EARRINGS_CATALOG, ...FEATURED_PRODUCTS];
  const sameCategoryProducts = allProducts.filter((p) => p.category === product.category && p.id !== product.id);
  const fallbackProducts = allProducts.filter((p) => p.id !== product.id);
  const relatedProducts = (sameCategoryProducts.length >= 4 ? sameCategoryProducts : fallbackProducts).slice(0, 5);

  const isFavorite = favorites.includes(product.id);

  return (
    <div className="bg-[#F8F4ED] min-h-screen text-[#241F1B]">
      
      {/* 1. Breadcrumbs Hierarchy */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-3">
        <nav aria-label="Migalhas de navegação">
          <ol className="flex flex-wrap items-center gap-1.5 text-xs text-[#766D64] font-light">
            <li>
              <button
                onClick={onNavigateHome}
                className="hover:text-[#2A211B] transition-colors cursor-pointer"
              >
                Início
              </button>
            </li>
            <li>
              <ChevronRight className="w-3 h-3 text-[#766D64]/50" />
            </li>
            <li>
              <button
                onClick={onNavigateCategories}
                className="hover:text-[#2A211B] transition-colors cursor-pointer"
              >
                Categorias
              </button>
            </li>
            <li>
              <ChevronRight className="w-3 h-3 text-[#766D64]/50" />
            </li>
            <li>
              <button
                onClick={onNavigateEarrings}
                className="hover:text-[#2A211B] transition-colors cursor-pointer"
              >
                Brincos
              </button>
            </li>
            <li>
              <ChevronRight className="w-3 h-3 text-[#766D64]/50" />
            </li>
            <li>
              <button
                onClick={onNavigateEarrings}
                className="hover:text-[#2A211B] transition-colors cursor-pointer"
              >
                Argolas
              </button>
            </li>
            <li>
              <ChevronRight className="w-3 h-3 text-[#766D64]/50" />
            </li>
            <li className="text-[#241F1B] font-medium" aria-current="page">
              {product.name}
            </li>
          </ol>
        </nav>
      </div>

      {/* 2. Main Product Area (2 Columns) */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          
          {/* Left Column: Gallery (lg:col-span-7) */}
          <div className="lg:col-span-7">
            <ProductGallery
              images={galleryImages}
              productName={product.name}
              isFavorite={isFavorite}
              onToggleFavorite={() => onToggleFavorite(product)}
            />
          </div>

          {/* Right Column: Purchase Panel (lg:col-span-5) */}
          <div className="lg:col-span-5 bg-white/50 backdrop-blur-xs p-6 sm:p-8 rounded-3xl border border-[#E7DED3] shadow-xs">
            <ProductPurchasePanel
              product={product}
              selectedSize={selectedSize}
              onSelectSize={setSelectedSize}
              onAddToCart={(prod, qty, sz) => onAddToCart(prod, qty, sz)}
              onOpenWhatsApp={() => setIsWhatsAppModalOpen(true)}
              onOpenInfo={onOpenInfo}
              availableUnits={stockUnits}
            />
          </div>

        </div>
      </div>

      {/* 3. Operational Quality Bar (4 badges) */}
      <ProductQualityBar product={product} />

      {/* 4. Detailed Information Section (Mini Gallery + Tabs + Card) */}
      <ProductDetailsSection
        product={product}
        images={galleryImages}
        onOpenAllPhotos={() => setIsGlobalLightboxOpen(true)}
        selectedSize={selectedSize}
      />

      {/* 5. Recommendations Carousel: "Você também pode gostar" */}
      <RelatedProductsSection
        products={relatedProducts}
        favorites={favorites}
        onToggleFavorite={onToggleFavorite}
        onAddToCart={(prod) => onAddToCart(prod, 1, 'P (1,5 cm)')}
        onSelectProduct={onSelectProduct}
        onViewAll={onNavigateEarrings}
      />

      {/* 6. Editorial Brand Banner */}
      <ProductEditorialBanner
        onOpenWhatsApp={() => setIsWhatsAppModalOpen(true)}
      />

      {/* WhatsApp Modal */}
      <WhatsAppModal
        isOpen={isWhatsAppModalOpen}
        onClose={() => setIsWhatsAppModalOpen(false)}
        product={product}
        selectedSize={selectedSize}
      />

      {/* Fullscreen Lightbox Modal */}
      <ProductLightboxModal
        isOpen={isGlobalLightboxOpen}
        onClose={() => setIsGlobalLightboxOpen(false)}
        images={galleryImages}
        currentIndex={lightboxIndex}
        onSelectIndex={setLightboxIndex}
        productName={product.name}
      />

    </div>
  );
};
