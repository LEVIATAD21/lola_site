import React from 'react';
import { X, Sparkles, Instagram, Heart } from 'lucide-react';
import { InstagramPost } from '../data/mockData';
import { INSTAGRAM_HANDLE, INSTAGRAM_URL } from '../data/siteConfig';

interface InfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  content: string;
  post?: InstagramPost | null;
}

export const InfoModal: React.FC<InfoModalProps> = ({
  isOpen,
  onClose,
  title,
  content,
  post,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in"
      />

      <div className="min-h-full flex items-center justify-center p-4 text-center sm:p-0">
        <div className="relative bg-white rounded-2xl max-w-lg w-full text-left overflow-hidden shadow-2xl border border-[#E7DED3] my-8 animate-in zoom-in-95 duration-200">
          
          {/* Header */}
          <div className="p-5 border-b border-[#E7DED3] flex items-center justify-between bg-[#F8F4ED]">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#C49A5A]" />
              <h3 className="font-serif-brand text-lg font-semibold text-[#241F1B]">
                {post ? 'Publicação no Instagram' : title}
              </h3>
            </div>
            <button
              onClick={onClose}
              aria-label="Fechar"
              className="p-1.5 text-[#766D64] hover:text-[#2A211B] rounded-full hover:bg-black/5 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {post ? (
              <div className="space-y-4">
                <div className="aspect-square rounded-xl overflow-hidden bg-[#F1E8DC] border border-[#E7DED3]">
                  <img
                    src={post.image}
                    alt={post.alt}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-[#766D64]">
                    <span className="font-semibold text-[#2A211B]">@{INSTAGRAM_HANDLE}</span>
                    <span className="flex items-center gap-1 text-[#C49A5A]">
                      <Heart className="w-3.5 h-3.5 fill-[#C49A5A]" />
                      Publicação de demonstração
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-[#241F1B] leading-relaxed">
                    {post.caption}
                  </p>
                </div>
                <div className="pt-2">
                  <a
                    href={INSTAGRAM_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2.5 px-4 rounded-full bg-[#2A211B] hover:bg-[#C49A5A] text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                  >
                    <Instagram className="w-4 h-4" />
                    <span>Ver no perfil oficial da Lola</span>
                  </a>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-xs sm:text-sm text-[#241F1B] leading-relaxed whitespace-pre-line font-light">
                  {content}
                </div>
                <div className="p-3 bg-[#F1E8DC]/50 rounded-xl border border-[#E7DED3] text-[11px] text-[#766D64]">
                  💡 <strong>Informação do protótipo:</strong> Este conteúdo institucional faz parte da primeira versão da página inicial da LOLA Aço Inox & Acessórios. Os dados oficiais serão validados diretamente com a responsável antes do lançamento em produção.
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 bg-[#F8F4ED] border-t border-[#E7DED3] flex justify-end">
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-full bg-[#2A211B] hover:bg-[#C49A5A] text-white text-xs font-medium transition-colors cursor-pointer"
            >
              Fechar
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};
