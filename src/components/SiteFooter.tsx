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
                      'Nosso suporte funciona de Segunda a Sexta, das 9h às 18h.\n\nWhatsApp: (11) 98765-4321\nE-mail: contato@lolaacessorios.com.br\nTempo médio de resposta: até 2 horas úteis.'
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
                      'Quer fazer parte da equipe Lola? Envie seu currículo e portfólio para talentos@lolaacessorios.com.br (Canal demonstrativo).'
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
                      '1. O aço inox escurece?\nNão! O aço inoxidável 316L cirúrgico não oxida, não descasca e possui altíssima resistência à água e suor.\n\n2. As peças causam alergia?\nSão hipoalergênicas, livres de níquel tóxico.\n\n3. Como cuidar das minhas peças?\nBasta limpar com flanela macia e guardar em local seco.'
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
                      'Entregamos para todo o Brasil via Correios e Jadlog.\n\n• Capitais: 2 a 5 dias úteis\n• Demais cidades: 4 a 10 dias úteis\nO código de rastreio é enviado automaticamente após o envio.'
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
                      'Garantimos a primeira troca grátis em até 7 dias corridos após o recebimento, conforme o Código de Defesa do Consumidor. A peça deve estar na embalagem original e sem sinais de uso.'
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
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#241F1B]">
              Políticas
            </h4>
            <ul className="space-y-2 text-xs text-[#766D64]">
              <li>
                <button
                  onClick={() =>
                    onOpenInfo(
                      'Política de Privacidade',
                      'Na Lola Aço Inox, respeitamos sua privacidade e protegemos seus dados pessoais de acordo com a LGPD (Lei Geral de Proteção de Dados). Nunca compartilhamos dados cadastrais com terceiros.'
                    )
                  }
                  className="hover:text-[#C49A5A] transition-colors cursor-pointer"
                >
                  Privacidade
                </button>
              </li>
              <li>
                <button
                  onClick={() =>
                    onOpenInfo(
                      'Termos de Uso',
                      'O acesso e uso deste catálogo online pressupõem a aceitação dos termos de compra e política comercial da loja Lola Aço Inox & Acessórios.'
                    )
                  }
                  className="hover:text-[#C49A5A] transition-colors cursor-pointer"
                >
                  Termos de uso
                </button>
              </li>
              <li>
                <button
                  onClick={() =>
                    onOpenInfo(
                      'Política de Cookies',
                      'Utilizamos cookies necessários para manter o seu carrinho de compras funcional e aprimorar a sua navegação.'
                    )
                  }
                  className="hover:text-[#C49A5A] transition-colors cursor-pointer"
                >
                  Política de cookies
                </button>
              </li>
            </ul>
          </div>

          {/* Col 5: Formas de Pagamento */}
          <div className="col-span-2 md:col-span-1 space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#241F1B]">
              Formas de pagamento
            </h4>
            <div className="flex flex-wrap items-center gap-2.5">
              
              {/* PIX */}
              <div className="h-7 px-2.5 rounded bg-[#F8F4ED] border border-[#E7DED3] flex items-center justify-center font-bold text-[#32BCAD] text-[11px] tracking-wide">
                pix
              </div>

              {/* VISA */}
              <div className="h-7 px-2.5 rounded bg-[#F8F4ED] border border-[#E7DED3] flex items-center justify-center font-black italic text-[#1A1F71] text-xs">
                VISA
              </div>

              {/* MASTERCARD */}
              <div className="h-7 px-2 rounded bg-[#F8F4ED] border border-[#E7DED3] flex items-center justify-center">
                <div className="flex -space-x-1.5">
                  <div className="w-3.5 h-3.5 rounded-full bg-[#EB001B]" />
                  <div className="w-3.5 h-3.5 rounded-full bg-[#F79E1B] opacity-80" />
                </div>
              </div>

              {/* ELO */}
              <div className="h-7 px-2.5 rounded bg-[#F8F4ED] border border-[#E7DED3] flex items-center justify-center font-bold text-[#000000] text-[11px]">
                <span className="text-[#00A4E4]">e</span>
                <span className="text-[#FFCB05]">l</span>
                <span className="text-[#ED1C24]">o</span>
              </div>

            </div>
            <p className="text-[11px] text-[#766D64] pt-1">
              Até 6x sem juros ou 5% OFF no Pix
            </p>
          </div>

        </div>

        {/* Legal Bottom Bar */}
        <div className="pt-6 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-[#766D64]">
          <p>
            © 2025 Lola Aço Inox & Acessórios. Todos os direitos reservados.
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

      {/* Floating Back-to-Top Button */}
      <button
        onClick={scrollToTop}
        aria-label="Voltar ao topo da página"
        className="fixed bottom-6 right-6 z-30 w-11 h-11 rounded-full bg-[#2A211B] text-white shadow-xl hover:bg-[#C49A5A] transition-all flex items-center justify-center cursor-pointer hover:scale-105 active:scale-95"
      >
        <ChevronUp className="w-5 h-5" />
      </button>
    </footer>
  );
};
