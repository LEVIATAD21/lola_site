import React from 'react';
import { ChevronUp, Heart } from 'lucide-react';

interface SiteFooterProps {
  onOpenInfo: (title: string, content: string) => void;
}

export const SiteFooter: React.FC<SiteFooterProps> = ({ onOpenInfo }) => {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer className="bg-white border-t border-[#E7DED3] text-[#241F1B] pt-14 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Main Footer Columns */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-8 pb-12 border-b border-[#E7DED3]">
          
          {/* Col 1: Brand & Bio */}
          <div className="col-span-2 md:col-span-1 space-y-3">
            <button
              onClick={scrollToTop}
              className="flex flex-col items-start text-left focus:outline-none group cursor-pointer"
            >
              <span className="font-serif-brand text-2xl font-semibold tracking-wider text-[#2A211B] group-hover:text-[#C49A5A] transition-colors">
                LOLA
              </span>
              <span className="text-[9px] tracking-[0.25em] font-medium text-[#766D64] -mt-1 uppercase">
                Aço Inox & Acessórios
              </span>
            </button>
            <p className="text-xs text-[#766D64] leading-relaxed max-w-xs font-light">
              Semijoias e acessórios contemporâneos em aço inoxidável. Brilho duradouro, conforto e sofisticação para o seu dia a dia.
            </p>
          </div>

          {/* Col 2: Institucional */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#241F1B]">
              Institucional
            </h4>
            <ul className="space-y-2 text-xs text-[#766D64]">
              <li>
                <button
                  onClick={() =>
                    onOpenInfo(
                      'Sobre Nós',
                      'A Lola Aço Inox & Acessórios nasceu com o propósito de democratizar o acesso a semijoias de altíssima durabilidade, com estética sofisticada e conforto hipoalergênico.'
                    )
                  }
                  className="hover:text-[#C49A5A] transition-colors cursor-pointer"
                >
                  Sobre nós
                </button>
              </li>
              <li>
                <button
                  onClick={() =>
                    onOpenInfo(
                      'Contato & Atendimento',
                      'Nosso canal oficial de atendimento estará disponível em breve.\n\nHorário previsto de suporte: Segunda a Sexta, das 9h às 18h.\nCanal oficial no WhatsApp e e-mail serão divulgados no lançamento.'
                    )
                  }
                  className="hover:text-[#C49A5A] transition-colors cursor-pointer"
                >
                  Contato
                </button>
              </li>
              <li>
                <button
                  onClick={() =>
                    onOpenInfo(
                      'Trabalhe Conosco',
                      'Quer fazer parte da equipe Lola? Deixe seu contato pelo atendimento da loja — o canal oficial de recrutamento será divulgado no lançamento.'
                    )
                  }
                  className="hover:text-[#C49A5A] transition-colors cursor-pointer"
                >
                  Trabalhe conosco
                </button>
              </li>
            </ul>
          </div>

          {/* Col 3: Ajuda */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#241F1B]">
              Ajuda
            </h4>
            <ul className="space-y-2 text-xs text-[#766D64]">
              <li>
                <button
                  onClick={() =>
                    onOpenInfo(
                      'Perguntas Frequentes (FAQ)',
                      '1. Os produtos escurecem?\nAs informações de material de cada peça constam na ficha do produto e podem ser confirmadas com o atendimento antes da compra.\n\n2. As peças causam alergia?\nA composição declarada aparece em cada anúncio. Em caso de sensibilidade, consulte o atendimento.\n\n3. Como cuidar das minhas peças?\nEvite o contato com produtos químicos e guarde em local seco. Em caso de dúvida, fale com a loja.'
                    )
                  }
                  className="hover:text-[#C49A5A] transition-colors cursor-pointer"
                >
                  Perguntas frequentes
                </button>
              </li>
              <li>
                <button
                  onClick={() =>
                    onOpenInfo(
                      'Entrega e Prazos',
                      'Os prazos de entrega e modalidades de frete serão cotados conforme a tabela oficial dos Correios e transportadoras parceiras na finalização do pedido.'
                    )
                  }
                  className="hover:text-[#C49A5A] transition-colors cursor-pointer"
                >
                  Entrega e prazos
                </button>
              </li>
              <li>
                <button
                  onClick={() =>
                    onOpenInfo(
                      'Trocas e Devoluções',
                      'Você tem 7 dias corridos a partir do recebimento para exercer o direito de arrependimento, conforme o Código de Defesa do Consumidor. Condições de troca e garantia serão confirmadas pela loja no atendimento antes da compra.'
                    )
                  }
                  className="hover:text-[#C49A5A] transition-colors cursor-pointer"
                >
                  Trocas e devoluções
                </button>
              </li>
            </ul>
          </div>

          {/* Col 4: Políticas */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#241F1B]">Políticas</h4>
            <ul className="space-y-2 text-xs text-[#766D64]">
              <li><a href="/privacidade/" className="hover:text-[#C49A5A] transition-colors">Política de Privacidade</a></li>
              <li>
                <button
                  onClick={() => onOpenInfo(
                    'Termos de Uso',
                    'Esta vitrine é um catálogo ilustrativo, sem conclusão de compras ou pagamentos online. Produtos, condições de oferta, preços e estoque precisam ser confirmados pelo atendimento oficial da LOLA. Os termos comerciais completos serão publicados antes da ativação de compras.'
                  )}
                  className="hover:text-[#C49A5A] transition-colors cursor-pointer"
                >Termos de uso</button>
              </li>
              <li><a href="/cookies/" className="hover:text-[#C49A5A] transition-colors">Política de cookies</a></li>
            </ul>
          </div>

          {/* Col 5: Pagamentos em preparação */}
          <div className="col-span-2 md:col-span-1 space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#241F1B]">Pagamentos</h4>
            <p className="text-xs text-[#766D64] leading-relaxed">
              Pagamentos e pedidos pelo site ainda não estão habilitados.
              Consulte preços, estoque e condições com a equipe oficial antes de qualquer compra.
            </p>
            <a href="https://www.instagram.com/lola_acoinox/" target="_blank" rel="noopener noreferrer"
              className="inline-block text-xs font-semibold text-[#8B6A3D] underline hover:text-[#C49A5A]">
              Contato oficial da LOLA
            </a>
          </div>

        </div>

        {/* Legal Bottom Bar */}
        <div className="pt-6 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-[#766D64]">
          <p>
            © 2026 Lola Aço Inox & Acessórios. Todos os direitos reservados.
          </p>
          
          {/* Cursive signoff matching Design 02 */}
          <div className="flex items-center gap-3">
            <span className="font-serif-brand text-lg text-[#2A211B] italic font-medium">Lola</span>
            <span className="font-script text-xl sm:text-2xl text-[#2A211B] select-none">
              Mais que acessórios, é sobre você! ♡
            </span>
          </div>
        </div>
      </div>

      {/* Floating Back-to-Top Button (posicionado acima do widget de chat para não sobrepor) */}
      <button
        onClick={scrollToTop}
        aria-label="Voltar ao topo da página"
        className="fixed bottom-20 right-5 sm:bottom-22 sm:right-5 z-30 w-10 h-10 rounded-full bg-[#2A211B]/90 hover:bg-[#C49A5A] text-white shadow-lg transition-all flex items-center justify-center cursor-pointer hover:scale-105 active:scale-95 border border-white/20"
      >
        <ChevronUp className="w-4 h-4" />
      </button>
    </footer>
  );
};
