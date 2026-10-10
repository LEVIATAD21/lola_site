/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { AnnouncementBar } from './components/AnnouncementBar';
import { SiteHeader } from './components/SiteHeader';
import { HeroCarousel } from './components/HeroCarousel';
import { CategorySection } from './components/CategorySection';
import { FeaturedProductsSection } from './components/FeaturedProductsSection';
import { BenefitsStrip } from './components/BenefitsStrip';
import { SocialSection } from './components/SocialSection';
import { SiteFooter } from './components/SiteFooter';
import { CartDrawer } from './components/CartDrawer';
import { ProductDetailModal } from './components/ProductDetailModal';
import { FavoritesModal } from './components/FavoritesModal';
import { InfoModal } from './components/InfoModal';
import { ToastNotification } from './components/ToastNotification';
import { EarringsCategoryPage } from './components/category/EarringsCategoryPage';
import { ProductDetailPage } from './components/product/ProductDetailPage';
import { CartPage } from './components/cart/CartPage';
import { CheckoutPage } from './components/checkout/CheckoutPage';
import { ChatbotAssistente } from './components/ChatbotAssistente';
import { ReportModal } from './components/ReportModal';
import { FileText } from 'lucide-react';
import { Product, Benefit, InstagramPost, EARRINGS_CATALOG, FEATURED_PRODUCTS } from './data/mockData';
import { CartItem, ToastMessage } from './types';
import { deductStock } from './services/api';

export default function App() {
  // Page view state: 'home' | 'category-earrings' | 'product-detail' | 'cart' | 'checkout'
  // Starts on 'checkout' as requested for Parte 5 (Design 05)
  const [pageView, setPageView] = useState<'home' | 'category-earrings' | 'product-detail' | 'cart' | 'checkout'>('checkout');

  // Active product for detail page (defaults to Brinco Argola Lisa)
  const [activeProduct, setActiveProduct] = useState<Product>(EARRINGS_CATALOG[0]);

  // Favorites State (stored in localStorage)
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('lola_favorites');
      return saved ? JSON.parse(saved) : ['brinco-1', 'brinco-3'];
    } catch {
      return ['brinco-1', 'brinco-3'];
    }
  });

  // Cart State (stored in localStorage) - defaults to 3 items matching Design 04 screenshot
  const [cartItems, setCartItems] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('lola_cart');
      if (saved) return JSON.parse(saved);
    } catch {
      // fallback
    }

    return [
      {
        id: 'cart-1',
        productId: 'brinco-1',
        name: 'Brinco Argola Lisa',
        price: 49.9,
        image: '/src/assets/images/product_earrings_1791578709776.jpg',
        category: 'Brincos',
        variant: 'M (2,0 cm)',
        color: 'Dourado',
        material: 'Aço inox',
        inStock: true,
        quantity: 1,
      },
      {
        id: 'cart-2',
        productId: 'prod-colar-1',
        name: 'Colar Coração',
        price: 59.9,
        image: '/src/assets/images/product_necklace_1791578719682.jpg',
        category: 'Colares',
        variant: 'Único',
        color: 'Dourado',
        material: 'Aço inox',
        inStock: true,
        quantity: 1,
      },
      {
        id: 'cart-3',
        productId: 'prod-pulseira-1',
        name: 'Pulseira Corrente',
        price: 54.9,
        image: '/src/assets/images/product_bracelets_1791578728452.jpg',
        category: 'Pulseiras',
        variant: '18 cm',
        color: 'Dourado',
        material: 'Aço inox',
        inStock: true,
        quantity: 1,
      },
    ];
  });

  // Modal & Drawer visibility states
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isFavoritesOpen, setIsFavoritesOpen] = useState(false);
  const [selectedProductForModal, setSelectedProductForModal] = useState<Product | null>(null);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  
  // Info Modal states
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const [infoModalTitle, setInfoModalTitle] = useState('');
  const [infoModalContent, setInfoModalContent] = useState('');
  const [selectedPost, setSelectedPost] = useState<InstagramPost | null>(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  // Category filter state for home page
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string | null>(null);

  // Toast feedback state
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Sync favorites with localStorage
  useEffect(() => {
    try {
      localStorage.setItem('lola_favorites', JSON.stringify(favorites));
    } catch {
      // Fallback for storage restrictions
    }
  }, [favorites]);

  // Sync cart with localStorage
  useEffect(() => {
    try {
      localStorage.setItem('lola_cart', JSON.stringify(cartItems));
    } catch {
      // Fallback for storage restrictions
    }
  }, [cartItems]);

  // Synchronize dynamic document.title, meta description and URL route
  useEffect(() => {
    let title = 'LOLA Aço Inox & Acessórios | Semijoias em Aço Inoxidável';
    let description = 'Loja online de semijoias e acessórios em aço inoxidável com design elegante, hipoalergênico e acabamento refinado.';
    let routePath = '/';

    if (pageView === 'category-earrings') {
      title = 'Brincos em Aço Inox | LOLA Aço Inox & Acessórios';
      description = 'Descubra nossa coleção de brincos em aço inoxidável: argolas clássicas, pontos de luz e ear cuffs.';
      routePath = '/categoria/brincos';
    } else if (pageView === 'product-detail') {
      title = `${activeProduct.name} | LOLA Aço Inox & Acessórios`;
      description = `${activeProduct.name} em aço inoxidável 316L hipoalergênico e à prova d’água com 1 ano de garantia.`;
      routePath = `/produto/${activeProduct.id}`;
    } else if (pageView === 'cart') {
      title = 'Sua Sacola de Compras | LOLA Aço Inox';
      description = 'Revise seus itens na sacola de compras com cálculo de frete e garantia de 1 ano.';
      routePath = '/carrinho';
    } else if (pageView === 'checkout') {
      title = 'Finalizar Compra | LOLA Aço Inox';
      description = 'Conclua seu pedido na Lola Aço Inox com segurança via Pix, Cartão em até 12x ou Boleto.';
      routePath = '/checkout';
    }

    document.title = title;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute('content', description);
    }

    if (window.location.pathname !== routePath) {
      window.history.replaceState({ pageView }, title, routePath);
    }
  }, [pageView, activeProduct]);

  // Handle browser back and forward navigation
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (e.state?.pageView) {
        setPageView(e.state.pageView);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const addToast = (type: ToastMessage['type'], title: string, description?: string) => {
    const id = Date.now().toString() + Math.random().toString();
    const newToast: ToastMessage = { id, type, title, description };
    setToasts((prev) => [...prev.slice(-3), newToast]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  };

  const handleDismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Toggle favorite handler
  const handleToggleFavorite = (product: Product) => {
    const isCurrentlyFav = favorites.includes(product.id);
    if (isCurrentlyFav) {
      setFavorites((prev) => prev.filter((id) => id !== product.id));
      addToast('info', 'Removido dos favoritos', `${product.name} foi retirado da sua lista.`);
    } else {
      setFavorites((prev) => [...prev, product.id]);
      addToast('favorite', 'Salvo nos favoritos!', `${product.name} agora está nos seus favoritos.`);
    }
  };

  // Add item to cart
  const handleAddToCart = (product: Product, quantity = 1, size?: string) => {
    const itemKey = size ? `${product.id}-${size}` : product.id;
    const variantLabel = size || 'Único';

    setCartItems((prev) => {
      const existing = prev.find((item) => item.id === itemKey);
      if (existing) {
        return prev.map((item) =>
          item.id === existing.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      return [
        ...prev,
        {
          id: itemKey,
          productId: product.id,
          name: product.name,
          price: product.price,
          image: product.image,
          category: product.category,
          variant: variantLabel,
          color: product.color || 'Dourado',
          material: product.material || 'Aço inox',
          inStock: true,
          quantity,
        },
      ];
    });

    addToast(
      'success',
      'Adicionado à sacola!',
      `${quantity}x ${product.name} (R$ ${(product.price * quantity).toFixed(2).replace('.', ',')})`
    );
  };

  const handleUpdateCartQuantity = (id: string, delta: number) => {
    setCartItems((prev) =>
      prev
        .map((item) => {
          if (item.id === id) {
            const newQ = item.quantity + delta;
            return newQ > 0 ? { ...item, quantity: newQ } : null;
          }
          return item;
        })
        .filter((item): item is CartItem => item !== null)
    );
  };

  const handleRemoveCartItem = (id: string) => {
    setCartItems((prev) => prev.filter((item) => item.id !== id));
    addToast('info', 'Item removido da sacola');
  };

  const handleClearCart = () => {
    setCartItems([]);
    addToast('info', 'Sacola esvaziada', 'Todos os itens foram removidos da sua sacola.');
  };

  const handleSelectProduct = (product: Product) => {
    setActiveProduct(product);
    setPageView('product-detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenInfo = (title: string, content: string) => {
    setSelectedPost(null);
    setInfoModalTitle(title);
    setInfoModalContent(content);
    setIsInfoModalOpen(true);
  };

  const handleOpenAccount = () => {
    handleOpenInfo(
      'Área da Cliente Lola',
      'Bem-vinda! A área personalizada de login, histórico de pedidos e rastreamento em tempo real será integrada na próxima etapa.\n\nPor enquanto, suas peças favoritas e sua sacola já estão salvas nesta sessão local!'
    );
  };

  const handleOpenBenefit = (benefit: Benefit) => {
    handleOpenInfo(benefit.title, `${benefit.description}\n\nCondição demonstrativa da Lola Aço Inox & Acessórios. Detalhes completos e regras de garantia e envio serão confirmadas pela loja.`);
  };

  const handleOpenPost = (post: InstagramPost) => {
    setSelectedPost(post);
    setInfoModalTitle('Instagram @lolaacessorios');
    setInfoModalContent(post.caption);
    setIsInfoModalOpen(true);
  };

  const handleCheckoutDemo = () => {
    setIsCartOpen(false);
    handleOpenInfo(
      'Checkout em Desenvolvimento (Protótipo)',
      'Parabéns pela seleção das suas peças Lola!\n\nNesta etapa do protótipo, a conexão com gateway de pagamentos (Pix / Cartão) e cálculo oficial de frete com transportadoras será implementada na fase seguinte.\n\nTodos os seus itens foram contabilizados corretamente na interface!'
    );
  };

  const handleSelectCategory = (categorySlug: string) => {
    if (categorySlug.toLowerCase() === 'brincos') {
      setPageView('category-earrings');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      setPageView('home');
      const categoryMap: Record<string, string> = {
        colares: 'Colares',
        pulseiras: 'Pulseiras',
        aneis: 'Anéis',
        conjuntos: 'Conjuntos',
      };
      const mapped = categoryMap[categorySlug.toLowerCase()] || categorySlug;
      setSelectedCategoryFilter(mapped);

      setTimeout(() => {
        const el = document.getElementById('destaques');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    }
  };

  const navigateToHome = () => {
    setPageView('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToEarrings = () => {
    setPageView('category-earrings');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToProduct = () => {
    setPageView('product-detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToCart = () => {
    setPageView('cart');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToCheckout = () => {
    setIsCartOpen(false);
    setPageView('checkout');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const totalCartCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F4ED] text-[#241F1B]">
      
      {/* Design Switcher Bar (Quick view toggle between Design 01, 02, 03, 04 and 05) */}
      <div className="bg-[#1E1713] text-[#DCC7B0] text-[11px] py-1.5 px-4 border-b border-[#C49A5A]/30">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-1.5">
          <span className="font-medium text-white/90">
            Navegação entre telas:
          </span>
          <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
            <button
              onClick={navigateToHome}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors cursor-pointer ${
                pageView === 'home'
                  ? 'bg-[#C49A5A] text-white shadow-xs font-semibold'
                  : 'bg-white/10 text-white/80 hover:bg-white/20'
              }`}
            >
              Design 01 (Home)
            </button>
            <button
              onClick={navigateToEarrings}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors cursor-pointer ${
                pageView === 'category-earrings'
                  ? 'bg-[#C49A5A] text-white shadow-xs font-semibold'
                  : 'bg-white/10 text-white/80 hover:bg-white/20'
              }`}
            >
              Design 02 (Brincos)
            </button>
            <button
              onClick={navigateToProduct}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors cursor-pointer ${
                pageView === 'product-detail'
                  ? 'bg-[#C49A5A] text-white shadow-xs font-semibold'
                  : 'bg-white/10 text-white/80 hover:bg-white/20'
              }`}
            >
              Design 03 (Produto)
            </button>
            <button
              onClick={navigateToCart}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors cursor-pointer ${
                pageView === 'cart'
                  ? 'bg-[#C49A5A] text-white shadow-xs font-semibold'
                  : 'bg-white/10 text-white/80 hover:bg-white/20'
              }`}
            >
              Design 04 (Sacola)
            </button>
            <button
              onClick={navigateToCheckout}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors cursor-pointer ${
                pageView === 'checkout'
                  ? 'bg-[#C49A5A] text-white shadow-xs font-semibold'
                  : 'bg-white/10 text-white/80 hover:bg-white/20'
              }`}
            >
              Design 05 (Checkout)
            </button>
            <span className="hidden sm:inline text-white/20 mx-0.5">|</span>
            <button
              onClick={() => setIsReportModalOpen(true)}
              className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-700/80 hover:bg-emerald-600 text-white shadow-xs transition-colors cursor-pointer flex items-center gap-1 border border-emerald-400/30"
              title="Abrir o resumo executivo e auditoria técnica das 5 telas"
            >
              <FileText className="w-3 h-3 text-emerald-300" />
              <span>Ver Relatório Executivo</span>
            </button>
          </div>
        </div>
      </div>

      {/* 1. Barra superior de informações comerciais */}
      <AnnouncementBar onOpenInfo={handleOpenInfo} />

      {/* 2. Cabeçalho principal compartilhado */}
      <SiteHeader
        currentPageView={pageView}
        onNavigateHome={navigateToHome}
        onNavigateEarrings={navigateToEarrings}
        onNavigateCart={navigateToCart}
        cartCount={totalCartCount}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenAccount={handleOpenAccount}
        onOpenInfo={handleOpenInfo}
        onSelectCategory={handleSelectCategory}
        onSelectProduct={handleSelectProduct}
        favoritesCount={favorites.length}
        onOpenFavorites={() => setIsFavoritesOpen(true)}
      />

      {/* Main page content based on pageView */}
      {pageView === 'home' ? (
        <main className="flex-1">
          {/* Design 01: Home Page */}
          <HeroCarousel
            onExploreClick={() => {
              const el = document.getElementById('destaques');
              el?.scrollIntoView({ behavior: 'smooth' });
            }}
          />

          <CategorySection
            onSelectCategory={handleSelectCategory}
            onViewAllCategories={() => {
              setSelectedCategoryFilter(null);
              const el = document.getElementById('destaques');
              el?.scrollIntoView({ behavior: 'smooth' });
            }}
          />

          <FeaturedProductsSection
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
            onSelectProduct={handleSelectProduct}
            onViewAllProducts={() => {
              setSelectedCategoryFilter(null);
              const el = document.getElementById('destaques');
              el?.scrollIntoView({ behavior: 'smooth' });
            }}
            selectedCategoryFilter={selectedCategoryFilter}
            onClearFilter={() => setSelectedCategoryFilter(null)}
          />

          <BenefitsStrip onOpenBenefitInfo={handleOpenBenefit} />
          <SocialSection onOpenPost={handleOpenPost} />
        </main>
      ) : pageView === 'category-earrings' ? (
        <main className="flex-1">
          {/* Design 02: Página de Categoria "Brincos" */}
          <EarringsCategoryPage
            onNavigateHome={navigateToHome}
            onNavigateCategories={navigateToHome}
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
            onAddToCart={(product) => handleAddToCart(product, 1)}
            onSelectProduct={handleSelectProduct}
            onOpenInfo={handleOpenInfo}
          />
        </main>
      ) : pageView === 'product-detail' ? (
        <main className="flex-1">
          {/* Design 03: Página Individual de Produto */}
          <ProductDetailPage
            product={activeProduct}
            onNavigateHome={navigateToHome}
            onNavigateCategories={navigateToHome}
            onNavigateEarrings={navigateToEarrings}
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
            onAddToCart={handleAddToCart}
            onSelectProduct={handleSelectProduct}
            onOpenInfo={handleOpenInfo}
          />
        </main>
      ) : pageView === 'cart' ? (
        <main className="flex-1">
          {/* Design 04: Página do Carrinho de Compras (Sacola) */}
          <CartPage
            items={cartItems}
            onUpdateQuantity={handleUpdateCartQuantity}
            onRemoveItem={handleRemoveCartItem}
            onClearCart={handleClearCart}
            onContinueShopping={navigateToEarrings}
            onSelectProduct={handleSelectProduct}
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
            onAddToCart={handleAddToCart}
            onCheckout={navigateToCheckout}
            onOpenInfo={handleOpenInfo}
          />
        </main>
      ) : (
        <main className="flex-1">
          {/* Design 05: Finalização de Compra (Checkout) */}
          <CheckoutPage
            items={cartItems}
            onRemoveItem={handleRemoveCartItem}
            onClearCart={handleClearCart}
            onBackToCart={navigateToCart}
            onGoToAccount={handleOpenAccount}
            onContinueShopping={navigateToEarrings}
            onSelectProduct={handleSelectProduct}
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
            onAddToCart={handleAddToCart}
            onOrderCompleted={(orderData) => {
              orderData.items.forEach((item: CartItem) => {
                deductStock(item.productId, item.quantity);
              });
              handleClearCart();
              addToast(
                'success',
                `Pedido #${orderData.id} confirmado com sucesso!`,
                'Recebemos seu pedido e já estamos preparando suas semijoias Lola.'
              );
            }}
          />
        </main>
      )}

      {/* 3. Rodapé institucional compartilhado */}
      <SiteFooter onOpenInfo={handleOpenInfo} />

      {/* Drawers and Modals */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cartItems}
        onUpdateQuantity={handleUpdateCartQuantity}
        onRemoveItem={handleRemoveCartItem}
        onCheckout={navigateToCheckout}
        onExplore={() => {
          if (pageView === 'home') {
            const el = document.getElementById('destaques');
            el?.scrollIntoView({ behavior: 'smooth' });
          } else {
            navigateToEarrings();
          }
        }}
        onGoToCartPage={navigateToCart}
      />

      <ProductDetailModal
        product={selectedProductForModal}
        isOpen={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
        isFavorite={selectedProductForModal ? favorites.includes(selectedProductForModal.id) : false}
        onToggleFavorite={handleToggleFavorite}
        onAddToCart={handleAddToCart}
      />

      <FavoritesModal
        isOpen={isFavoritesOpen}
        onClose={() => setIsFavoritesOpen(false)}
        favorites={favorites}
        onRemoveFavorite={handleToggleFavorite}
        onSelectProduct={handleSelectProduct}
        onAddToCart={(prod) => handleAddToCart(prod, 1)}
        onExplore={() => {
          if (pageView === 'home') {
            const el = document.getElementById('destaques');
            el?.scrollIntoView({ behavior: 'smooth' });
          } else {
            navigateToEarrings();
          }
        }}
      />

      <InfoModal
        isOpen={isInfoModalOpen}
        onClose={() => setIsInfoModalOpen(false)}
        title={infoModalTitle}
        content={infoModalContent}
        post={selectedPost}
      />

      {/* 24/7 AI Sales & Inventory Assistant Widget */}
      <ChatbotAssistente
        currentProduct={pageView === 'product-detail' ? activeProduct : null}
        cartItems={cartItems}
        onSelectProduct={handleSelectProduct}
        onAddToCart={(prod, qty) => handleAddToCart(prod, qty)}
        catalog={[...EARRINGS_CATALOG, ...FEATURED_PRODUCTS]}
      />

      {/* Relatório Executivo e Auditoria Técnica Modal */}
      <ReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        onNavigateToScreen={(screen) => {
          setPageView(screen);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

      {/* Discrete feedback notifications */}
      <ToastNotification toasts={toasts} onDismiss={handleDismissToast} />

    </div>
  );
}
