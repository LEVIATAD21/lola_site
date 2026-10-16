import type { Product } from '../../data/mockData';

/**
 * Dados estruturados (JSON-LD) da página de produto: Product + Offer.
 *
 * Só entra aqui o que existe no catálogo (`src/data/mockData.ts`). Nada de
 * rating, review, brand ou disponibilidade inventados — os campos que o
 * catálogo não tem ficam de fora mesmo.
 */

export const LOJA_NOME = 'LOLA Aço Inox & Acessórios';

export type Disponibilidade =
  | 'https://schema.org/InStock'
  | 'https://schema.org/OutOfStock'
  | 'https://schema.org/PreOrder';

export interface ProductJsonLdOptions {
  /**
   * Passado pela rota de produto quando o serviço de estoque responder.
   * Sem isso, o Offer sai sem `availability` — Google aceita, e é melhor
   * omitir do que prometer estoque que a página não garante.
   */
  disponibilidade?: Disponibilidade;
  /**
   * Origem usada para transformar caminhos relativos (`/images/...`,
   * `/produto/...`) em URL absoluta. No navegador o padrão é
   * `window.location.origin`; em teste/node, sem origem, os caminhos saem
   * relativos.
   */
  origem?: string;
}

function resolverOrigem(opcoes?: ProductJsonLdOptions): string {
  if (opcoes?.origem !== undefined) {
    return opcoes.origem.replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return '';
}

export function buildProductJsonLd(
  product: Product,
  opcoes?: ProductJsonLdOptions,
): Record<string, unknown> {
  const origem = resolverOrigem(opcoes);

  const offer: Record<string, unknown> = {
    '@type': 'Offer',
    url: `${origem}/produto/${product.id}`,
    priceCurrency: 'BRL',
    // toFixed(2) fixa o formato monetário ("49.90") exigido pelo schema.org.
    price: product.price.toFixed(2),
    itemCondition: 'https://schema.org/NewCondition',
    seller: {
      '@type': 'Organization',
      name: LOJA_NOME,
    },
  };

  if (opcoes?.disponibilidade) {
    offer.availability = opcoes.disponibilidade;
  }

  const dados: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description,
    sku: product.id,
    category: product.category,
    image: `${origem}${product.image}`,
    offers: offer,
  };

  return dados;
}

export interface ProductJsonLdProps {
  product: Product;
  disponibilidade?: Disponibilidade;
}

/**
 * Serializa os dados para injetar dentro de `<script type="application/ld+json">`.
 *
 * `JSON.stringify` cuida de aspas, barras e quebras de linha; escapar o
 * `<` para `\u003c` (escape válido de JSON) torna impossível um nome ou
 * descrição de produto fechar o `<script>` antes da hora, sem alterar o
 * texto que o robô de busca lê.
 */
export function serializarJsonLd(dados: unknown): string {
  return JSON.stringify(dados).replace(/</g, '\\u003c');
}

/**
 * Injeta `<script type="application/ld+json">` no documento.
 *
 * Montagem prevista na rota `/produto/:id` de `src/App.tsx`. Colocar dentro
 * do `<main>` da página de produto; o script não é visível e não executa,
 * só é lido por robô de busca via DOM.
 */
export function ProductJsonLd({ product, disponibilidade }: ProductJsonLdProps) {
  const jsonSeguro = serializarJsonLd(buildProductJsonLd(product, { disponibilidade }));

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonSeguro }}
    />
  );
}
