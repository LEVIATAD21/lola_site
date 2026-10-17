import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FilterSidebar } from '../FilterSidebar';
import type { FilterState } from '../FilterSidebar';

/**
 * O ambiente de teste é `node` (sem jsdom): o HTML do render de servidor já
 * traz todas as seções abertas, então as contagens podem ser conferidas no
 * markup. A interação com os checkboxes fica para o E2E.
 */
const nada = () => undefined;

const semFiltros: FilterState = {
  category: 'all',
  priceRange: [],
  colors: [],
  materials: [],
};

type Counts = {
  types: Record<string, number>;
  priceRanges: Record<string, number>;
  colors: Record<string, number>;
  materials: Record<string, number>;
};

function renderBarra(counts: Counts) {
  return renderToStaticMarkup(
    <FilterSidebar filters={semFiltros} onChange={nada} onReset={nada} counts={counts} />
  );
}

const zerado: Counts = { types: {}, priceRanges: {}, colors: {}, materials: {} };

describe('FilterSidebar — contagens reais (DEBT #4)', () => {
  it('mostra zero em vez de inventar número quando o recorte não tem peça', () => {
    const markup = renderBarra(zerado);

    // Categoria: seis opções exibem (0); 'Todos os brincos' não exibe contagem.
    expect(markup.match(/\(0\)/g) ?? []).toHaveLength(6);
    // Preço, cor e material exibem o zero direto, sem parênteses.
    expect(markup.match(/>0</g) ?? []).toHaveLength(14);
    // Nenhum dos números de fallback pode aparecer.
    expect(markup).not.toMatch(/\((?:12|48|10|6|8|5|7|18|14|42|4|2|1|9|3)\)/);
    expect(markup).not.toMatch(/>(?:12|48|10|6|8|5|7|18|14|42|4|2|1|9|3)</);
  });

  it('não oculta a opção sem peça', () => {
    const markup = renderBarra(zerado);

    for (const rotulo of [
      'Argolas',
      'Pontos de luz',
      'Ear cuffs',
      'Estilo minimalista',
      'Com pedras',
      'Tendências',
      'Até R$ 29,90',
      'Acima de R$ 130,00',
      'Rosé',
      'Colorido',
      'Pérola artificial',
    ]) {
      expect(markup).toContain(rotulo);
    }
  });

  it('propaga a contagem real quando o recorte tem peças', () => {
    const markup = renderBarra({
      types: { Argolas: 7 },
      priceRanges: { 'under-30': 3 },
      colors: { Dourado: 9 },
      materials: { 'Aço inox': 11 },
    });

    expect(markup).toContain('(7)');
    expect(markup).toContain('>3<');
    expect(markup).toContain('>9<');
    expect(markup).toContain('>11<');
  });
});
