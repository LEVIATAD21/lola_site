import React, { useState, useMemo, useEffect } from 'react';
import { Filter, SlidersHorizontal, LayoutGrid, List, ChevronLeft, ChevronRight, X, RotateCcw } from 'lucide-react';
import { CategoryBanner } from './CategoryBanner';
import { FilterSidebar, FilterState } from './FilterSidebar';
import { MobileFilterDrawer } from './MobileFilterDrawer';
import { EarringProductCard } from './EarringProductCard';
import { CategorySecondaryBanner } from './CategorySecondaryBanner';
import { EARRINGS_CATALOG, Product } from '../../data/mockData';

interface EarringsCategoryPageProps {
  onNavigateHome: () => void;
  onNavigateCategories: () => void;
  favorites: string[];
  onToggleFavorite: (product: Product) => void;
  onAddToCart: (product: Product) => void;
  onSelectProduct: (product: Product) => void;
  onOpenInfo: (title: string, content: string) => void;
}

export const EarringsCategoryPage: React.FC<EarringsCategoryPageProps> = ({
  onNavigateHome,
  onNavigateCategories,
  favorites,
  onToggleFavorite,
  onAddToCart,
  onSelectProduct,
  onOpenInfo,
}) => {
  // Filter state
  const [filters, setFilters] = useState<FilterState>({
    category: 'all',
    priceRange: [],
    colors: [],
    materials: [],
  });

  const [sortBy, setSortBy] = useState<string>('recent');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState<boolean>(false);

  const itemsPerPage = 12;

  // Reset to page 1 whenever filters or sort change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters, sortBy]);

  // Dynamic counts for each filter option
  const counts = useMemo(() => {
    const types: Record<string, number> = { all: EARRINGS_CATALOG.length };
    const priceRanges: Record<string, number> = {
      'under-30': 0,
      '30-60': 0,
      '60-90': 0,
      '90-130': 0,
      'over-130': 0,
    };
    const colors: Record<string, number> = {};
    const materials: Record<string, number> = {};

    EARRINGS_CATALOG.forEach((item) => {
      // Types
      if (item.earringType) {
        types[item.earringType] = (types[item.earringType] || 0) + 1;
      }
      // Price
      if (item.price <= 29.99) priceRanges['under-30']++;
      else if (item.price >= 30.0 && item.price <= 59.99) priceRanges['30-60']++;
      else if (item.price >= 60.0 && item.price <= 89.99) priceRanges['60-90']++;
      else if (item.price >= 90.0 && item.price <= 129.99) priceRanges['90-130']++;
      else priceRanges['over-130']++;

      // Colors
      if (item.color) {
        colors[item.color] = (colors[item.color] || 0) + 1;
      }
      // Materials
      if (item.material) {
        materials[item.material] = (materials[item.material] || 0) + 1;
      }
    });

    return { types, priceRanges, colors, materials };
  }, []);

  // Filtered products list
  const filteredProducts = useMemo(() => {
    return EARRINGS_CATALOG.filter((item) => {
      // 1. Category / Type
      if (filters.category !== 'all' && item.earringType !== filters.category) {
        return false;
      }

      // 2. Price Range
      if (filters.priceRange.length > 0) {
        const matchesAnyRange = filters.priceRange.some((range) => {
          if (range === 'under-30') return item.price <= 29.99;
          if (range === '30-60') return item.price >= 30.0 && item.price <= 59.99;
          if (range === '60-90') return item.price >= 60.0 && item.price <= 89.99;
          if (range === '90-130') return item.price >= 90.0 && item.price <= 129.99;
          if (range === 'over-130') return item.price >= 130.0;
          return false;
        });
        if (!matchesAnyRange) return false;
      }

      // 3. Colors
      if (filters.colors.length > 0) {
        if (!item.color || !filters.colors.includes(item.color)) {
          return false;
        }
      }

      // 4. Materials
      if (filters.materials.length > 0) {
        if (!item.material || !filters.materials.includes(item.material)) {
          return false;
        }
      }

      return true;
    });
  }, [filters]);

  // Sorted products
  const sortedProducts = useMemo(() => {
    const list = [...filteredProducts];
    switch (sortBy) {
      case 'recent':
        return list.sort((a, b) => (b.isNewArrival ? 1 : 0) - (a.isNewArrival ? 1 : 0));
      case 'price-low':
        return list.sort((a, b) => a.price - b.price);
      case 'price-high':
        return list.sort((a, b) => b.price - a.price);
      case 'az':
        return list.sort((a, b) => a.name.localeCompare(b.name));
      default:
        return list;
    }
  }, [filteredProducts, sortBy]);

  // Paginated products
  const totalPages = Math.max(1, Math.ceil(sortedProducts.length / itemsPerPage));
  const paginatedProducts = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedProducts.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedProducts, currentPage, itemsPerPage]);

  const handleResetFilters = () => {
    setFilters({
      category: 'all',
      priceRange: [],
      colors: [],
      materials: [],
    });
  };

  const removeIndividualFilter = (type: 'category' | 'price' | 'color' | 'material', val: string) => {
    if (type === 'category') {
      setFilters((prev) => ({ ...prev, category: 'all' }));
    } else if (type === 'price') {
      setFilters((prev) => ({ ...prev, priceRange: prev.priceRange.filter((p) => p !== val) }));
    } else if (type === 'color') {
      setFilters((prev) => ({ ...prev, colors: prev.colors.filter((c) => c !== val) }));
    } else if (type === 'material') {
      setFilters((prev) => ({ ...prev, materials: prev.materials.filter((m) => m !== val) }));
    }
  };

  const activeFiltersCount =
    (filters.category !== 'all' ? 1 : 0) +
    filters.priceRange.length +
    filters.colors.length +
    filters.materials.length;

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="bg-[#F8F4ED] min-h-screen pb-16">
      
      {/* 1. Category Banner with breadcrumbs */}
      <CategoryBanner
        onNavigateHome={onNavigateHome}
        onNavigateCategories={onNavigateCategories}
      />

      {/* 2. Main Catalog Grid & Sidebar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
          
          {/* Desktop Left Sidebar Filters (col-span-3) */}
          <div className="hidden lg:block lg:col-span-3 sticky top-28 bg-white/70 backdrop-blur-xs p-6 rounded-2xl border border-[#E7DED3] shadow-xs">
            <FilterSidebar
              filters={filters}
              onChange={setFilters}
              onReset={handleResetFilters}
              counts={counts}
            />
          </div>

          {/* Right Products Area (col-span-9) */}
          <div className="lg:col-span-9 space-y-6">
            
            {/* Toolbar: Heading, Counter, Sort & View Mode */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E7DED3]">
              
              <div>
                <h2 className="font-serif-brand text-2xl sm:text-3xl font-semibold text-[#241F1B] tracking-tight">
                  Brincos
                </h2>
                <p className="text-xs text-[#766D64] mt-0.5 tabular-nums">
                  {filteredProducts.length} produtos encontrados
                </p>
              </div>

              <div className="flex items-center gap-3 self-end sm:self-auto w-full sm:w-auto justify-between sm:justify-end">
                
                {/* Mobile Filter Button */}
                <button
                  onClick={() => setIsMobileFiltersOpen(true)}
                  className="lg:hidden flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-[#E7DED3] text-xs font-semibold text-[#241F1B] hover:bg-[#F1E8DC] transition-colors cursor-pointer"
                >
                  <Filter className="w-3.5 h-3.5 text-[#C49A5A]" />
                  <span>Filtrar</span>
                  {activeFiltersCount > 0 && (
                    <span className="w-4 h-4 rounded-full bg-[#2A211B] text-white text-[10px] flex items-center justify-center">
                      {activeFiltersCount}
                    </span>
                  )}
                </button>

                <div className="flex items-center gap-3">
                  {/* Sort Selector matching mockup */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-[#766D64] hidden md:inline">Ordenar por:</span>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                      aria-label="Critério de ordenação de produtos"
                      className="text-xs font-medium text-[#241F1B] bg-white border border-[#E7DED3] rounded-xl px-3 py-2 focus:outline-none focus:border-[#C49A5A] cursor-pointer"
                    >
                      <option value="recent">Mais recentes</option>
                      <option value="price-low">Menor preço</option>
                      <option value="price-high">Maior preço</option>
                      <option value="az">Nome: A–Z</option>
                    </select>
                  </div>

                  {/* View Mode Toggle (Grid / List) */}
                  <div className="hidden sm:flex items-center bg-white border border-[#E7DED3] rounded-xl p-1 gap-1">
                    <button
                      onClick={() => setViewMode('grid')}
                      aria-label="Modo grade"
                      className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                        viewMode === 'grid'
                          ? 'bg-[#2A211B] text-white'
                          : 'text-[#766D64] hover:text-[#2A211B]'
                      }`}
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setViewMode('list')}
                      aria-label="Modo lista"
                      className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                        viewMode === 'list'
                          ? 'bg-[#2A211B] text-white'
                          : 'text-[#766D64] hover:text-[#2A211B]'
                      }`}
                    >
                      <List className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

              </div>
            </div>

            {/* Active Filter Chips */}
            {activeFiltersCount > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-1 pb-2">
                <span className="text-xs text-[#766D64]">Filtros aplicados:</span>

                {filters.category !== 'all' && (
                  <button
                    onClick={() => removeIndividualFilter('category', filters.category)}
                    className="inline-flex items-center gap-1.5 text-xs bg-white border border-[#E7DED3] text-[#241F1B] px-2.5 py-1 rounded-full hover:border-red-400 cursor-pointer group"
                  >
                    <span>{filters.category}</span>
                    <X className="w-3 h-3 text-[#766D64] group-hover:text-red-500" />
                  </button>
                )}

                {filters.priceRange.map((r) => {
                  const labels: Record<string, string> = {
                    'under-30': 'Até R$ 29,90',
                    '30-60': 'R$ 30,00 - R$ 59,90',
                    '60-90': 'R$ 60,00 - R$ 89,90',
                    '90-130': 'R$ 90,00 - R$ 129,90',
                    'over-130': 'Acima de R$ 130,00',
                  };
                  return (
                    <button
                      key={r}
                      onClick={() => removeIndividualFilter('price', r)}
                      className="inline-flex items-center gap-1.5 text-xs bg-white border border-[#E7DED3] text-[#241F1B] px-2.5 py-1 rounded-full hover:border-red-400 cursor-pointer group"
                    >
                      <span>{labels[r] || r}</span>
                      <X className="w-3 h-3 text-[#766D64] group-hover:text-red-500" />
                    </button>
                  );
                })}

                {filters.colors.map((c) => (
                  <button
                    key={c}
                    onClick={() => removeIndividualFilter('color', c)}
                    className="inline-flex items-center gap-1.5 text-xs bg-white border border-[#E7DED3] text-[#241F1B] px-2.5 py-1 rounded-full hover:border-red-400 cursor-pointer group"
                  >
                    <span>{c}</span>
                    <X className="w-3 h-3 text-[#766D64] group-hover:text-red-500" />
                  </button>
                ))}

                {filters.materials.map((m) => (
                  <button
                    key={m}
                    onClick={() => removeIndividualFilter('material', m)}
                    className="inline-flex items-center gap-1.5 text-xs bg-white border border-[#E7DED3] text-[#241F1B] px-2.5 py-1 rounded-full hover:border-red-400 cursor-pointer group"
                  >
                    <span>{m}</span>
                    <X className="w-3 h-3 text-[#766D64] group-hover:text-red-500" />
                  </button>
                ))}

                <button
                  onClick={handleResetFilters}
                  className="text-xs text-[#C49A5A] hover:underline font-semibold ml-1 cursor-pointer"
                >
                  Limpar tudo
                </button>
              </div>
            )}

            {/* Products Grid or Empty State */}
            {paginatedProducts.length > 0 ? (
              <div
                className={
                  viewMode === 'grid'
                    ? 'grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6'
                    : 'space-y-4'
                }
              >
                {paginatedProducts.map((product) => (
                  <EarringProductCard
                    key={product.id}
                    product={product}
                    isFavorite={favorites.includes(product.id)}
                    onToggleFavorite={onToggleFavorite}
                    onAddToCart={onAddToCart}
                    onSelectProduct={onSelectProduct}
                    viewMode={viewMode}
                  />
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-[#E7DED3] p-12 text-center space-y-4 my-8">
                <div className="w-16 h-16 rounded-full bg-[#F1E8DC] mx-auto flex items-center justify-center text-[#766D64]">
                  <SlidersHorizontal className="w-8 h-8 stroke-[1.5]" />
                </div>
                <div>
                  <h3 className="font-serif-brand text-xl font-semibold text-[#241F1B]">
                    Não encontramos brincos com esses filtros
                  </h3>
                  <p className="text-xs sm:text-sm text-[#766D64] mt-1.5 max-w-md mx-auto leading-relaxed">
                    Tente desmarcar algum filtro ou clique em &ldquo;Limpar filtros&rdquo; para explorar todos os modelos da coleção.
                  </p>
                </div>
                <button
                  onClick={handleResetFilters}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#2A211B] text-white text-xs font-semibold hover:bg-[#C49A5A] transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Limpar todos os filtros</span>
                </button>
              </div>
            )}

            {/* Pagination Controls (< 1 2 3 4 5 >) */}
            {totalPages > 1 && (
              <div className="pt-8 pb-4 flex items-center justify-center gap-2">
                <button
                  onClick={() => {
                    setCurrentPage((prev) => Math.max(1, prev - 1));
                    scrollToTop();
                  }}
                  disabled={currentPage === 1}
                  aria-label="Página anterior"
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-xs transition-colors ${
                    currentPage === 1
                      ? 'text-[#766D64]/40 cursor-not-allowed'
                      : 'text-[#241F1B] hover:bg-white cursor-pointer border border-[#E7DED3]'
                  }`}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                {[...Array(totalPages)].map((_, i) => {
                  const pageNumber = i + 1;
                  const isActive = currentPage === pageNumber;

                  return (
                    <button
                      key={pageNumber}
                      onClick={() => {
                        setCurrentPage(pageNumber);
                        scrollToTop();
                      }}
                      aria-label={`Ir para a página ${pageNumber}`}
                      aria-current={isActive ? 'page' : undefined}
                      className={`w-9 h-9 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                        isActive
                          ? 'bg-[#2A211B] text-white shadow-sm'
                          : 'bg-white text-[#766D64] hover:text-[#241F1B] hover:bg-[#F1E8DC] border border-[#E7DED3]'
                      }`}
                    >
                      {pageNumber}
                    </button>
                  );
                })}

                <button
                  onClick={() => {
                    setCurrentPage((prev) => Math.min(totalPages, prev + 1));
                    scrollToTop();
                  }}
                  disabled={currentPage === totalPages}
                  aria-label="Próxima página"
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-xs transition-colors ${
                    currentPage === totalPages
                      ? 'text-[#766D64]/40 cursor-not-allowed'
                      : 'text-[#241F1B] hover:bg-white cursor-pointer border border-[#E7DED3]'
                  }`}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* 3. Secondary Editorial Banner: Garantia e Qualidade */}
            <CategorySecondaryBanner
              onLearnMore={() =>
                onOpenInfo(
                  'Garantia & Qualidade Lola Aço Inox',
                  'Nossas semijoias em aço inoxidável cirúrgico 316L são produzidas com tecnologia de ponta e camadas reforçadas de banho dourado.\n\n• Não escurece e não oxida\n• Hipoalergênico (100% livre de níquel)\n• Alta resistência à água doce e suor\n• Acabamento espelhado de alta joalheria'
                )
              }
            />

          </div>

        </div>
      </div>

      {/* Mobile Drawer Filter Component */}
      <MobileFilterDrawer
        isOpen={isMobileFiltersOpen}
        onClose={() => setIsMobileFiltersOpen(false)}
        filters={filters}
        onChange={setFilters}
        onReset={handleResetFilters}
        totalFilteredCount={filteredProducts.length}
        counts={counts}
      />

    </div>
  );
};
