/**
 * Fonte única das modalidades de frete da vitrine.
 *
 * Fica em `src/data/` (e não no componente) porque dois consumidores distintos
 * precisam da mesma tabela: o modal de cálculo, que mostra as opções, e o
 * leitor do `localStorage`, que precisa reconstruir a escolha do cliente sem
 * confiar em nome/prazo/valor gravados pelo navegador.
 */

export interface ShippingOption {
  id: string;
  name: string;
  time: string;
  price: number;
}

/**
 * Recalcula o preço da modalidade escolhida para o subtotal atual.
 * Mesma regra demonstrativa usada pelo modal — mantém carrinho e checkout coerentes.
 */
export function quoteShipping(optionId: string, subtotal: number): number {
  const isFreeShipping = subtotal >= 150.0;
  switch (optionId) {
    case 'pac':
      return isFreeShipping ? 0 : 19.9;
    case 'sedex':
      return isFreeShipping ? 12.9 : 28.9;
    case 'transportadora':
      return isFreeShipping ? 0 : 22.5;
    default:
      return isFreeShipping ? 0 : 19.9;
  }
}

/** Rótulos canônicos — a ordem define a ordem exibida no modal. */
const SHIPPING_OPTION_LABELS: Array<{ id: string; name: string; time: string }> = [
  { id: 'pac', name: 'PAC Correios', time: '4 a 7 dias úteis' },
  { id: 'sedex', name: 'SEDEX Expresso', time: '1 a 3 dias úteis' },
  { id: 'transportadora', name: 'Jadlog Transportadora', time: '2 a 5 dias úteis' },
];

export const SHIPPING_OPTION_IDS: readonly string[] = SHIPPING_OPTION_LABELS.map((o) => o.id);

/** Opções com preço já cotado para o subtotal informado. */
export function listShippingOptions(subtotal: number): ShippingOption[] {
  return SHIPPING_OPTION_LABELS.map((option) => ({
    ...option,
    price: quoteShipping(option.id, subtotal),
  }));
}

/**
 * Reconstrói a modalidade escolhida a partir de um ID vindo de fora
 * (ex.: `localStorage`). ID desconhecido retorna null — nunca se aceita o
 * nome nem o preço gravados pelo navegador.
 *
 * O `price` devolvido é uma referência base; as páginas sempre recalculam com
 * `quoteShipping(id, subtotal)` antes de exibir ou somar.
 */
export function getStoredShippingOption(optionId: string): ShippingOption | null {
  const label = SHIPPING_OPTION_LABELS.find((option) => option.id === optionId);
  if (!label) return null;
  return { ...label, price: quoteShipping(label.id, 0) };
}
