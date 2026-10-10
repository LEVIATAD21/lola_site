import React from 'react';
import { Truck, ShieldCheck, Sparkles, Instagram } from 'lucide-react';

interface AnnouncementBarProps {
  onOpenInfo: (title: string, content: string) => void;
}

export const AnnouncementBar: React.FC<AnnouncementBarProps> = ({ onOpenInfo }) => {
  return (
    <div className="bg-[#2A211B] text-[#F8F4ED] text-[11px] sm:text-xs py-2 px-4 transition-colors">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-2 tracking-wide font-light">
        {/* Left item */}
        <div className="flex items-center gap-1.5 text-[#E7DED3]/90">
          <Sparkles className="w-3.5 h-3.5 text-[#C49A5A]" />
          <span>Aço inox • Semijoias • Acessórios</span>
        </div>

        {/* Center item */}
        <button
          onClick={() => onOpenInfo('Envios e Entregas', 'A loja enviará pedidos para todo o Brasil. As transportadoras e opções de envio oficiais serão configuradas na fase de lançamento.')}
          className="flex items-center gap-1.5 hover:text-[#C49A5A] transition-colors cursor-pointer"
        >
          <Truck className="w-3.5 h-3.5 text-[#C49A5A]" />
          <span>Envios para todo o Brasil</span>
        </button>

        {/* Right item */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => onOpenInfo('Ambiente Seguro', 'Este é o ambiente demonstrativo do front-end da LOLA Aço Inox & Acessórios. A integração bancária e certificados de segurança oficiais serão ativados pelo backend.')}
            className="flex items-center gap-1.5 hover:text-[#C49A5A] transition-colors cursor-pointer"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-[#C49A5A]" />
            <span>Ambiente seguro</span>
          </button>

          {/* Social shortcuts — perfis oficiais ainda não publicados */}
          <div className="hidden sm:flex items-center gap-2.5 text-[#E7DED3]/80 border-l border-white/20 pl-3">
            <button
              type="button"
              onClick={() =>
                onOpenInfo(
                  'Instagram da LOLA',
                  'Os perfis oficiais da LOLA Aço Inox & Acessórios serão divulgados no lançamento da loja. Até lá, siga o atendimento pelos canais oficiais informados no rodapé.'
                )
              }
              aria-label="Instagram da LOLA Aço Inox — perfil em breve"
              className="hover:text-[#C49A5A] transition-colors cursor-pointer"
            >
              <Instagram className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() =>
                onOpenInfo(
                  'TikTok da LOLA',
                  'Os perfis oficiais da LOLA Aço Inox & Acessórios serão divulgados no lançamento da loja. Até lá, siga o atendimento pelos canais oficiais informados no rodapé.'
                )
              }
              aria-label="TikTok da LOLA Aço Inox — perfil em breve"
              className="hover:text-[#C49A5A] transition-colors cursor-pointer text-[10px] font-bold"
            >
              TikTok
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
