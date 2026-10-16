import { describe, it, expect } from 'vitest';
import type { Product } from '../../../data/mockData';
import { buildProductJsonLd, serializarJsonLd } from '../ProductJsonLd';

const produto: Product = {
  id: 'brinco-1',
  name: 'Brinco Argola Lisa',
  category: 'Brincos',
  price: 49.9,
  image: '/images/product_earrings_1791578709776.jpg',
  description: 'Argola clássica lisa com fecho click seguro e acabamento polido.',
  isFeatured: true,
};

describe('buildProductJsonLd', () => {
  it('monta Product + Offer com preço BRL e URL absoluta quando há origem', () => {
    const dados = buildProductJsonLd(produto, { origem: 'https://loja.exemplo' });

    expect(dados['@context']).toBe('https://schema.org');
    expect(dados['@type']).toBe('Product');
    expect(dados.name).toBe('Brinco Argola Lisa');
    expect(dados.sku).toBe('brinco-1');

    const oferta = dados.offers as Record<string, unknown>;
    expect(oferta['@type']).toBe('Offer');
    expect(oferta.priceCurrency).toBe('BRL');
    expect(oferta.price).toBe('49.90');
    expect(oferta.url).toBe('https://loja.exemplo/produto/brinco-1');
    expect(dados.image).toBe(
      'https://loja.exemplo/images/product_earrings_1791578709776.jpg',
    );
  });

  it('omite availability quando o catálogo não informa estoque', () => {
    const dados = buildProductJsonLd(produto, { origem: 'https://loja.exemplo' });
    const oferta = dados.offers as Record<string, unknown>;

    expect(oferta.availability).toBeUndefined();
  });

  it('inclui availability apenas quando informada', () => {
    const dados = buildProductJsonLd(produto, {
      origem: 'https://loja.exemplo',
      disponibilidade: 'https://schema.org/InStock',
    });
    const oferta = dados.offers as Record<string, unknown>;

    expect(oferta.availability).toBe('https://schema.org/InStock');
  });

  it('fica com caminhos relativos fora do navegador (sem origem e sem window)', () => {
    const dados = buildProductJsonLd(produto);

    expect(dados.image).toBe('/images/product_earrings_1791578709776.jpg');
    const oferta = dados.offers as Record<string, unknown>;
    expect(oferta.url).toBe('/produto/brinco-1');
  });

  it('não deixa "</script>" cru no JSON serializado', () => {
    const produtoComTextoHostil: Product = {
      ...produto,
      description: 'Descrição com </script><script>alert(1)</script> e <b>negrito</b>.',
    };

    const json = serializarJsonLd(buildProductJsonLd(produtoComTextoHostil));

    expect(json).not.toContain('</script');
    expect(json).toContain('\\u003c');
    // O escape é reversível: quem lê o JSON lê o texto original de volta.
    const dados = JSON.parse(json) as { description: string };
    expect(dados.description).toContain('</script>');
  });
});
