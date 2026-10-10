import React, { useState, useRef, useEffect } from 'react';
import { Search, User, ShoppingBag, ChevronDown, Menu, X, ArrowRight, Heart } from 'lucide-react';
import { CATEGORIES, FEATURED_PRODUCTS, Product, Category } from '../data/mockData';

interface SiteHeaderProps {
  currentPageView: 'home' | 'category-earrings' | 'product-detail' | 'cart' | 'checkout';
  onNavigateHome: () => void;
  onNavigateEarrings: () => void;
  onNavigateCart?: () => void;
  cartCount: number;
  onOpenCart: () => void;
  onOpenAccount: () => void;
  onOpenInfo: (title: string, content: string) => void;
  onSelectCategory: (categorySlug: string) => void;
  onSelectProduct: (product: Product) => void;
  favoritesCount: number;
  onOpenFavorites: () => void;
}

export const SiteHeader: React.FC<SiteHeaderProps> = ({
  currentPageView,
  onNavigateHome,
  onNavigateEarrings,
  onNavigateCart,
  cartCount,
  onOpenCart,
  onOpenAccount,
  onOpenInfo,
  onSelectCategory,
  onSelectProduct,
  favoritesCount,
  onOpenFavorites,
}) => {
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const categoryMenuRef = useRef<HTMLDivElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Close category dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (categoryMenuRef.current && !categoryMenuRef.current.contains(event.target as Node)) {
        setIsCategoryMenuOpen(false);
      }
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter products based on search query
  const searchResults = searchQuery.trim()
    ? FEATURED_PRODUCTS.filter(
        (p) =>
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.category.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  const handleCategoryClick = (category: Category) => {
    setIsCategoryMenuOpen(false);
    setIsMobileMenuOpen(false);
    if (category.slug === 'brincos') {
      onNavigateEarrings();
    } else {
      onSelectCategory(category.slug);
    }
  };

  const handleProductSearchClick = (product: Product) => {
    setSearchQuery('');
    setIsSearchFocused(false);
    onSelectProduct(product);
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <header className="sticky top-0 z-40 bg-[#F8F4ED]/95 backdrop-blur-md border-b border-[#E7DED3] transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20 gap-4">
          
          {/* Logo brand */}
          <button
            onClick={onNavigateHome}
            className="flex flex-col items-start text-left focus:outline-none group cursor-pointer shrink-0"
          >
            <span className="font-serif-brand text-2xl sm:text-3xl font-semibold tracking-wider text-[#2A211B] group-hover:text-[#C49A5A] transition-colors">
              LOLA
            </span>
            <span className="text-[9px] sm:text-[10px] tracking-[0.25em] font-medium text-[#766D64] -mt-1 uppercase">
              Aço Inox & Acessórios
            </span>
          </button>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center space-x-7 text-sm font-medium text-[#241F1B]">
            <button
              onClick={onNavigateHome}
              className={`relative py-1 cursor-pointer transition-colors ${
                currentPageView === 'home'
                  ? 'text-[#2A211B] font-semibold after:content-[\'\'] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[#2A211B]'
                  : 'text-[#241F1B] hover:text-[#C49A5A]'
              }`}
            >
              Início
            </button>

            {/* Categories dropdown */}
            <div className="relative" ref={categoryMenuRef}>
              <button
                onClick={() => setIsCategoryMenuOpen(!isCategoryMenuOpen)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setIsCategoryMenuOpen(!isCategoryMenuOpen);
                  }
                }}
                aria-expanded={isCategoryMenuOpen}
                aria-haspopup="true"
                className={`flex items-center gap-1.5 py-1 transition-colors cursor-pointer ${
                  currentPageView === 'category-earrings'
                    ? 'text-[#2A211B] font-semibold after:content-[\'\'] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[#C49A5A]'
                    : 'text-[#241F1B] hover:text-[#C49A5A]'
                }`}
              >
                <span>Categorias</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    isCategoryMenuOpen ? 'rotate-180 text-[#C49A5A]' : 'text-[#766D64]'
                  }`}
                />
              </button>

              {/* Submenu Dropdown */}
              {isCategoryMenuOpen && (
                <div className="absolute top-full left-0 mt-3 w-64 bg-[#FFFFFF] rounded-xl shadow-xl border border-[#E7DED3] p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-3 py-2 text-xs font-semibold text-[#766D64] uppercase tracking-wider border-b border-[#F1E8DC]">
                    Nossas Coleções
                  </div>
                  <div className="py-1">
                    {CATEGORIES.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => handleCategoryClick(cat)}
                        className="w-full flex items-center justify-between px-3 py-2 text-sm text-[#241F1B] rounded-lg hover:bg-[#F1E8DC] transition-colors text-left group cursor-pointer"
                      >
                        <span className="group-hover:text-[#2A211B] font-medium">{cat.name}</span>
                        <span className="text-xs text-[#766D64]">{cat.itemCount}</span>
                      </button>
                    ))}
                  </div>
                  <div className="p-2 border-t border-[#F1E8DC]">
                    <a
                      href="#categorias"
                      onClick={(e) => {
                        e.preventDefault();
                        setIsCategoryMenuOpen(false);
                        const el = document.getElementById('categorias');
                        el?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className="flex items-center justify-center gap-1 text-xs text-[#C49A5A] hover:underline font-semibold py-1"
                    >
                      <span>Ver todas as categorias</span>
                      <ArrowRight className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              )}
            </div>

            <a
              href="#destaques"
              onClick={(e) => {
                e.preventDefault();
                const el = document.getElementById('destaques');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="text-[#241F1B] hover:text-[#C49A5A] transition-colors py-1"
            >
              Novidades
            </a>

            <button
              onClick={() =>
                onOpenInfo(
                  'Sobre a LOLA Aço Inox & Acessórios',
                  'A LOLA nasceu do amor por acessórios modernos, resistentes e acessíveis. Especializada em semijoias em aço inoxidável cirúrgico com banho dourado de alta durabilidade, nossa missão é oferecer peças versáteis que combinam com você em todos os momentos — sem escurecer, descascar ou causar irritações.'
                )
              }
              className="text-[#241F1B] hover:text-[#C49A5A] transition-colors py-1 cursor-pointer"
            >
              Sobre nós
            </button>

            <button
              onClick={() =>
                onOpenInfo(
                  'Fale com a LOLA',
                  'Nosso atendimento é dedicado a tirar todas as suas dúvidas sobre peças, combinações e entregas.\n\n• WhatsApp e e-mail oficiais serão divulgados no lançamento da loja.\n• Horário previsto de suporte: Segunda a Sexta, das 9h às 18h.'
                )
              }
              className="text-[#241F1B] hover:text-[#C49A5A] transition-colors py-1 cursor-pointer"
            >
              Contato
            </button>
          </nav>

          {/* Right side: Search bar & Action Icons */}
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Search Box */}
            <div className="relative hidden md:block" ref={searchContainerRef}>
              <div className="relative flex items-center">
                <input
                  type="text"
                  placeholder="O que você procura?"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setIsSearchFocused(true)}
                  className="w-48 lg:w-64 h-10 pl-4 pr-9 rounded-full bg-[#FFFFFF] border border-[#E7DED3] text-sm text-[#241F1B] placeholder-[#766D64] focus:outline-none focus:border-[#C49A5A] focus:ring-1 focus:ring-[#C49A5A] transition-all"
                />
                {searchQuery ? (
                  <button
                    onClick={() => setSearchQuery('')}
                    aria-label="Limpar busca"
                    className="absolute right-3 text-[#766D64] hover:text-[#2A211B] p-1 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <Search className="absolute right-3.5 w-4 h-4 text-[#766D64] pointer-events-none" />
                )}
              </div>

              {/* Search results popup */}
              {isSearchFocused && searchQuery.trim() && (
                <div className="absolute top-full right-0 mt-2 w-72 sm:w-80 bg-white rounded-xl shadow-xl border border-[#E7DED3] p-3 z-50">
                  <div className="text-xs font-semibold text-[#766D64] uppercase tracking-wider mb-2">
                    Resultados encontrados ({searchResults.length})
                  </div>
                  {searchResults.length > 0 ? (
                    <div className="space-y-2 max-h-72 overflow-y-auto">
                      {searchResults.map((product) => (
                        <button
                          key={product.id}
                          onClick={() => handleProductSearchClick(product)}
                          className="w-full flex items-center gap-3 p-1.5 rounded-lg hover:bg-[#F1E8DC] transition-colors text-left group cursor-pointer"
                        >
                          <img
                            src={product.image}
                            alt={product.name}
                            className="w-10 h-10 rounded-md object-cover border border-[#E7DED3]"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-[#241F1B] truncate group-hover:text-[#C49A5A]">
                              {product.name}
                            </p>
                            <p className="text-[11px] text-[#766D64]">{product.category}</p>
                          </div>
                          <span className="text-xs font-semibold text-[#2A211B]">
                            R$ {product.price.toFixed(2).replace('.', ',')}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="py-4 text-center text-xs text-[#766D64]">
                      Nenhuma peça encontrada para &ldquo;{searchQuery}&rdquo;.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Favorites Icon Button */}
            <button
              onClick={onOpenFavorites}
              aria-label={`Favoritos: ${favoritesCount} salvos`}
              className="relative p-2 text-[#241F1B] hover:text-[#C49A5A] transition-colors rounded-full hover:bg-[#F1E8DC]/60 cursor-pointer"
            >
              <Heart className="w-5 h-5" />
              {favoritesCount > 0 && (
                <span className="absolute 1 top-1 right-1 w-4 h-4 bg-[#C49A5A] text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {favoritesCount}
                </span>
              )}
            </button>

            {/* Account Icon Button */}
            <button
              onClick={onOpenAccount}
              aria-label="Minha conta"
              className="p-2 text-[#241F1B] hover:text-[#C49A5A] transition-colors rounded-full hover:bg-[#F1E8DC]/60 cursor-pointer"
            >
              <User className="w-5 h-5" />
            </button>

            {/* Cart / Bag Icon Button */}
            <button
              onClick={() => (onNavigateCart ? onNavigateCart() : onOpenCart())}
              aria-label={`Sacola de compras, ${cartCount} itens`}
              className="relative p-2 text-[#241F1B] hover:text-[#C49A5A] transition-colors rounded-full hover:bg-[#F1E8DC]/60 cursor-pointer"
            >
              <ShoppingBag className="w-5 h-5" />
              {cartCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-[#2A211B] text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </button>

            {/* Mobile menu trigger button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label={isMobileMenuOpen ? 'Fechar menu de navegação' : 'Abrir menu de navegação'}
              className="lg:hidden p-2 text-[#241F1B] hover:text-[#C49A5A] transition-colors cursor-pointer"
            >
              {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Search Input in subheader */}
        <div className="md:hidden pb-3">
          <div className="relative">
            <input
              type="text"
              placeholder="O que você procura?"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-4 pr-9 rounded-full bg-white border border-[#E7DED3] text-sm text-[#241F1B] placeholder-[#766D64] focus:outline-none focus:border-[#C49A5A]"
            />
            <Search className="absolute right-3 top-2.5 w-4 h-4 text-[#766D64]" />
          </div>
          {searchQuery.trim() && (
            <div className="mt-2 bg-white rounded-lg p-2 border border-[#E7DED3] max-h-48 overflow-y-auto">
              {searchResults.length > 0 ? (
                searchResults.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => handleProductSearchClick(product)}
                    className="w-full flex items-center justify-between p-2 hover:bg-[#F1E8DC] rounded text-left text-xs"
                  >
                    <span className="font-medium text-[#241F1B]">{product.name}</span>
                    <span className="text-[#C49A5A] font-semibold">
                      R$ {product.price.toFixed(2).replace('.', ',')}
                    </span>
                  </button>
                ))
              ) : (
                <p className="text-center text-xs text-[#766D64] py-2">Nenhum produto encontrado</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {isMobileMenuOpen && (
        <div className="lg:hidden bg-white border-b border-[#E7DED3] px-6 py-4 shadow-lg animate-in slide-in-from-top duration-200">
          <div className="space-y-4">
            <button
              onClick={() => {
                scrollToTop();
                setIsMobileMenuOpen(false);
              }}
              className="block w-full text-left py-2 font-medium text-[#241F1B] border-b border-[#F1E8DC]"
            >
              Início
            </button>

            <div>
              <p className="text-xs font-semibold text-[#766D64] uppercase tracking-wider mb-2">Categorias</p>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => handleCategoryClick(cat)}
                    className="p-2 text-xs text-left bg-[#F8F4ED] rounded-lg text-[#241F1B] font-medium hover:bg-[#F1E8DC]"
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>

            <a
              href="#destaques"
              onClick={() => setIsMobileMenuOpen(false)}
              className="block w-full text-left py-2 font-medium text-[#241F1B] border-b border-[#F1E8DC]"
            >
              Novidades & Destaques
            </a>

            <button
              onClick={() => {
                setIsMobileMenuOpen(false);
                onOpenInfo(
                  'Sobre a LOLA',
                  'Semijoias e acessórios em aço inoxidável cirúrgico com banho dourado de alta durabilidade e estilo atemporal.'
                );
              }}
              className="block w-full text-left py-2 font-medium text-[#241F1B] border-b border-[#F1E8DC]"
            >
              Sobre nós
            </button>

            <button
              onClick={() => {
                setIsMobileMenuOpen(false);
                onOpenInfo(
                  'Fale Conosco',
                  'Horário previsto de atendimento: Segunda a Sexta, das 9h às 18h.\n\nWhatsApp e e-mail oficiais serão divulgados no lançamento da loja.'
                );
              }}
              className="block w-full text-left py-2 font-medium text-[#241F1B]"
            >
              Contato
            </button>

            <div className="pt-2 flex items-center justify-between border-t border-[#F1E8DC] text-sm">
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onOpenAccount();
                }}
                className="flex items-center gap-2 text-[#766D64] hover:text-[#2A211B]"
              >
                <User className="w-4 h-4" />
                <span>Minha Conta</span>
              </button>
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onOpenFavorites();
                }}
                className="flex items-center gap-2 text-[#766D64] hover:text-[#2A211B]"
              >
                <Heart className="w-4 h-4 text-[#C49A5A]" />
                <span>Favoritos ({favoritesCount})</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
