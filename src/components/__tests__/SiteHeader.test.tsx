import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SiteHeader, searchProducts } from '../SiteHeader';
import { ALL_PRODUCTS, FEATURED_PRODUCTS } from '../../data/mockData';

/**
 * O ambiente de teste é `node` (sem jsdom): a busca é coberta pela função pura
 * exportada e pelo HTML do render de servidor. Digitar no campo e ver o popup
 * com foco exige DOM real e fica para o E2E.
 */
const nada = () => undefined;

describe('searchProducts — busca da vitrine (DEBT #3)', () => {
  it('varre o catálogo consolidado, não só os destaques', () => {
    expect(ALL_PRODUCTS).toHaveLength(25);
    expect(FEATURED_PRODUCTS).toHaveLength(10);

    // 'brinco' casa nome/categoria de 20 peças no catálogo; entre os destaques só 5.
    expect(searchProducts('brinco')).toHaveLength(20);
  });

  it('devolve peça que não está nos destaques', () => {
    const ids = searchProducts('pratead').map((p) => p.id);

    expect(ids).toEqual(['brinco-13', 'brinco-16']);
    const destaques = FEATURED_PRODUCTS.map((p) => p.id);
    for (const id of ids) expect(destaques).not.toContain(id);
  });

  it('não devolve nada para consulta vazia ou só espaços', () => {
    expect(searchProducts('')).toEqual([]);
    expect(searchProducts('   ')).toEqual([]);
  });

  it('não diferencia maiúsculas', () => {
    expect(searchProducts('ARGOLA')).toEqual(searchProducts('argola'));
  });
});

describe('SiteHeader — render de servidor', () => {
  it('renderiza o campo de busca', () => {
    const markup = renderToStaticMarkup(
      <SiteHeader
        currentPageView="home"
        onNavigateHome={nada}
        onNavigateEarrings={nada}
        cartCount={0}
        onOpenCart={nada}
        onOpenAccount={nada}
        onOpenInfo={nada}
        onSelectCategory={nada}
        onSelectProduct={nada}
        favoritesCount={0}
        onOpenFavorites={nada}
      />
    );

    expect(markup).toContain('O que você procura?');
  });
});
