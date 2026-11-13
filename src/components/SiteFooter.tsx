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
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#241F1B]">
              Políticas
            </h4>
            <ul className="space-y-2 text-xs text-[#766D64]">
              <li>
                <button
                  onClick={() =>
                    onOpenInfo(
                      'Política de Privacidade',
                      'LOLA Aço Inox & Acessórios — Aviso de Privacidade (versão preliminar, 13/11/2026).\n\nQuando as funcionalidades estiverem habilitadas, poderemos tratar dados de cadastro e compra (nome, contato, endereço, itens e histórico de pedidos) para atendimento, execução contratual, entrega, prevenção a fraudes e cumprimento de obrigações legais, observada a base legal aplicável. Dados de pagamento deverão ser processados pelo prestador contratado, sem armazenamento de dados completos de cartão pela vitrine.\n\nA navegação pode envolver registros técnicos de segurança e serviços de infraestrutura; carrinho e favoritos usam armazenamento local no dispositivo. O assistente virtual pode transmitir o texto digitado ao provedor configurado: não envie dados sensíveis no chat. Recursos opcionais de publicidade e análise dependerão de configuração e da base legal correspondente.\n\nPrazos de guarda variam conforme a categoria de informação e obrigações legais; não há compromisso geral de exclusão automática em 90 dias. O titular pode solicitar confirmação, acesso, correção, informação sobre compartilhamento, anonimização, bloqueio, exclusão quando cabível, portabilidade e revogação de consentimento quando aplicável (art. 18 da LGPD). A solicitação exige validação de identidade para impedir acesso indevido.\n\nA identificação completa da empresa controladora, seu endereço, canal de privacidade, operadores, transferências internacionais e prazos específicos devem ser confirmados pela proprietária antes de receber dados reais. Até a publicação desses canais, procure o atendimento oficial da loja pelo Instagram @lola_acoinox. Este aviso não constitui certificação de conformidade com a LGPD.'
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
                      'Carrinho, favoritos e preferências podem utilizar armazenamento local (localStorage) deste navegador. Sessões autenticadas e medidas de proteção podem depender de cookies necessários e registros técnicos do servidor. Serviços de terceiros eventualmente configurados podem adotar suas próprias tecnologias; antes de habilitar publicidade ou análise não essencial, a loja deve identificar essas tecnologias e disponibilizar controles adequados à base legal aplicável. Não declaramos ausência absoluta de cookies de terceiros sem validar a implantação efetiva.'
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
              Condições de parcelamento e Pix sob consulta no checkout
            </p>
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
