import { useState, useEffect, useRef } from 'react';
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
import { INSTAGRAM_HANDLE } from './data/siteConfig';
import { CartItem, ToastMessage } from './types';
import { getProductStock } from './services/api';
import { parseStoredCart } from './utils/cartStorage';
import { ShippingOption } from './components/cart/ShippingCalculatorModal';

export default function App() {
  const findProductById = (id: string): Product | undefined =>
    [...EARRINGS_CATALOG, ...FEATURED_PRODUCTS].find((p) => p.id === id);

  // Inicialização segura de rota a partir de window.location.pathname
  const getInitialView = (): 'home' | 'category-earrings' | 'product-detail' | 'cart' | 'checkout' => {
    if (typeof window === 'undefined') return 'home';
    const path = window.location.pathname.toLowerCase();
    if (path === '/categoria/brincos') return 'category-earrings';
    if (path.startsWith('/produto/')) {
      const id = path.replace('/produto/', '').trim();
      return findProductById(id) ? 'product-detail' : 'home';
    }
    if (path === '/carrinho') return 'cart';
    if (path === '/checkout') return 'checkout';
    return 'home';
  };

  const getInitialProduct = (): Product => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      if (path.startsWith('/produto/')) {
        const found = findProductById(path.replace('/produto/', '').trim());
        if (found) return found;
      }
    }
    return EARRINGS_CATALOG[0];
  };

  const [pageView, setPageView] = useState<'home' | 'category-earrings' | 'product-detail' | 'cart' | 'checkout'>(getInitialView);
  const [activeProduct, setActiveProduct] = useState<Product>(getInitialProduct);

  // Favorites State (stored in localStorage) - starts empty if none saved
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('lola_favorites');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // fallback
    }
    return [];
  });

  // Cart State (stored in localStorage) - starts empty if none saved.
  // Itens são validados por forma e o seed antigo de demonstração é descartado.
  const [cartItems, setCartItems] = useState<CartItem[]>(() =>
    parseStoredCart(localStorage.getItem('lola_cart'))
  );

  // Estado compartilhado do fluxo de compra: cupom e frete aplicados no carrinho
  // permanecem coerentes ao seguir para o checkout (persistidos localmente).
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; percentage: number } | null>(() => {
    try {
      const raw = localStorage.getItem('lola_coupon');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.code === 'string' && typeof parsed.percentage === 'number' && parsed.percentage > 0) {
        return parsed;
      }
    } catch {
      // fallback: sem cupom
    }
    return null;
  });

  const [appliedShipping, setAppliedShipping] = useState<ShippingOption | null>(() => {
    try {
      const raw = localStorage.getItem('lola_shipping');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.id === 'string' && typeof parsed.name === 'string' && typeof parsed.price === 'number') {
        return parsed;
      }
    } catch {
      // fallback: sem frete escolhido
    }
    return null;
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

  // Sync shared coupon/shipping between cart and checkout
  useEffect(() => {
    try {
      if (appliedCoupon) localStorage.setItem('lola_coupon', JSON.stringify(appliedCoupon));
      else localStorage.removeItem('lola_coupon');
    } catch {
      // Fallback for storage restrictions
    }
  }, [appliedCoupon]);

  useEffect(() => {
    try {
      if (appliedShipping) localStorage.setItem('lola_shipping', JSON.stringify(appliedShipping));
      else localStorage.removeItem('lola_shipping');
    } catch {
      // Fallback for storage restrictions
    }
  }, [appliedShipping]);

  // Synchronize dynamic document.title, meta description and URL route
  useEffect(() => {
    let title = 'LOLA Aço Inox & Acessórios | Semijoias em Aço Inoxidável';
    let description = 'Loja online de semijoias e acessórios em aço inoxidável com design elegante e acabamento refinado.';
    let routePath = '/';

    if (pageView === 'category-earrings') {
      title = 'Brincos em Aço Inox | LOLA Aço Inox & Acessórios';
      description = 'Descubra nossa coleção de brincos em aço inoxidável: argolas clássicas, pontos de luz e ear cuffs.';
      routePath = '/categoria/brincos';
    } else if (pageView === 'product-detail') {
      title = `${activeProduct.name} | LOLA Aço Inox & Acessórios`;
      description = `${activeProduct.name} - Conheça os detalhes desta peça contemporânea da coleção LOLA.`;
      routePath = `/produto/${activeProduct.id}`;
    } else if (pageView === 'cart') {
      title = 'Sua Sacola de Compras | LOLA Aço Inox';
      description = 'Revise seus itens na sacola de compras com cálculo de frete.';
      routePath = '/carrinho';
    } else if (pageView === 'checkout') {
      title = 'Finalizar Compra | LOLA Aço Inox';
      description = 'Informe os dados de entrega e registre um pré-pedido na Lola Aço Inox. Pagamentos ainda em integração.';
      routePath = '/checkout';
    }

    document.title = title;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute('content', description);
    }

    if (window.location.pathname !== routePath) {
      window.history.pushState({ pageView, productId: activeProduct.id }, title, routePath);
    }
  }, [pageView, activeProduct]);

  // Handle browser back and forward navigation
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (e.state?.pageView) {
        setPageView(e.state.pageView);
        if (e.state.pageView === 'product-detail' && e.state.productId) {
          const all = [...EARRINGS_CATALOG, ...FEATURED_PRODUCTS];
          const found = all.find((p) => p.id === e.state.productId);
          if (found) setActiveProduct(found);
        }
      } else {
        const path = window.location.pathname.toLowerCase();
        if (path === '/categoria/brincos') {
          setPageView('category-earrings');
        } else if (path.startsWith('/produto/')) {
          const id = path.replace('/produto/', '').trim();
          const all = [...EARRINGS_CATALOG, ...FEATURED_PRODUCTS];
          const found = all.find((p) => p.id === id);
          if (found) {
            setActiveProduct(found);
            setPageView('product-detail');
          } else {
            setPageView('home');
          }
        } else if (path === '/carrinho') {
          setPageView('cart');
        } else if (path === '/checkout') {
          setPageView('checkout');
        } else {
          setPageView('home');
        }
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

  // Serializa consultas de estoque para evitar corrida entre cliques rápidos
  const stockCheckBusy = useRef(false);

  // Add item to cart — sempre revalida o estoque no servidor antes de registrar
  const handleAddToCart = async (product: Product, quantity = 1, size?: string) => {
    if (!product || quantity <= 0) return;
    const itemKey = size ? `${product.id}-${size}` : product.id;
    const variantLabel = size || 'Único';

    if (stockCheckBusy.current) {
      addToast('info', 'Aguarde um instante', 'Já há uma consulta de estoque em andamento. Tente novamente em seguida.');
      return;
    }
    stockCheckBusy.current = true;
    let stock;
    try {
      stock = await getProductStock(product.id);
    } finally {
      stockCheckBusy.current = false;
    }
    if (!stock) {
      addToast(
        'error',
        'Estoque não confirmado',
        `Não foi possível confirmar a disponibilidade de ${product.name}. Fale com a loja pelo WhatsApp.`
      );
      return;
    }
    if (stock.disponivel <= 0) {
      addToast('error', 'Produto esgotado', `${product.name} não possui unidades disponíveis no momento.`);
      return;
    }

    const existing = cartItems.find((item) => item.id === itemKey);
    const currentQty = existing ? existing.quantity : 0;
    let finalQty = quantity;

    if (currentQty + quantity > stock.disponivel) {
      const allowed = stock.disponivel - currentQty;
      if (allowed <= 0) {
        addToast(
          'error',
          'Limite de estoque atingido',
          `Só restam ${stock.disponivel} un. de ${product.name} e elas já estão na sua sacola.`
        );
        return;
      }
      finalQty = allowed;
      addToast(
        'info',
        'Quantidade ajustada ao estoque',
        `Adicionamos apenas ${allowed} un. de ${product.name} (disponível: ${stock.disponivel} un.).`
      );
    }

    setCartItems((prev) => {
      const existingItem = prev.find((item) => item.id === itemKey);
      if (existingItem) {
        return prev.map((item) =>
          item.id === existingItem.id
            ? { ...item, quantity: item.quantity + finalQty, inStock: true }
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
          quantity: finalQty,
        },
      ];
    });

    addToast(
      'success',
      'Adicionado à sacola!',
      `${finalQty}x ${product.name} (R$ ${(product.price * finalQty).toFixed(2).replace('.', ',')})`
    );
  };

  // Altera a quantidade consultando o estoque antes de aumentar — nunca ultrapassa a disponibilidade conhecida
  const handleUpdateCartQuantity = async (id: string, delta: number) => {
    if (delta === 0) return;
    const item = cartItems.find((i) => i.id === id);
    if (!item) return;

    let effectiveDelta = delta;

    if (delta > 0) {
      if (stockCheckBusy.current) {
        addToast('info', 'Aguarde um instante', 'Já há uma consulta de estoque em andamento. Tente novamente em seguida.');
        return;
      }
      stockCheckBusy.current = true;
      let stock;
      try {
        stock = await getProductStock(item.productId);
      } finally {
        stockCheckBusy.current = false;
      }
      if (!stock) {
        addToast(
          'error',
          'Estoque não confirmado',
          `Não foi possível confirmar a disponibilidade de ${item.name}.`
        );
        return;
      }
      if (item.quantity + delta > stock.disponivel) {
        if (item.quantity >= stock.disponivel) {
          addToast(
            'error',
            'Limite de estoque atingido',
            `Só restam ${stock.disponivel} un. de ${item.name} e elas já estão na sua sacola.`
          );
          return;
        }
        effectiveDelta = stock.disponivel - item.quantity;
        addToast(
          'info',
          'Quantidade ajustada ao estoque',
          `A quantidade de ${item.name} foi limitada a ${stock.disponivel} un.`
        );
      }
    }

    setCartItems((prev) =>
      prev
        .map((cartItem) => {
          if (cartItem.id === id) {
            const newQ = cartItem.quantity + effectiveDelta;
            return newQ > 0 ? { ...cartItem, quantity: newQ } : null;
          }
          return cartItem;
        })
        .filter((cartItem): cartItem is CartItem => cartItem !== null)
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
    setInfoModalTitle(`Instagram @${INSTAGRAM_HANDLE}`);
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
            coupon={appliedCoupon}
            onApplyCoupon={(code, percentage) => setAppliedCoupon({ code, percentage })}
            shipping={appliedShipping}
            onSelectShipping={setAppliedShipping}
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
            coupon={appliedCoupon}
            onApplyCoupon={(code, percentage) => setAppliedCoupon({ code, percentage })}
            shipping={appliedShipping}
            onOpenInfo={handleOpenInfo}
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
