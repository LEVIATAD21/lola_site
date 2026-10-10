import React from 'react';
import { Instagram, ExternalLink } from 'lucide-react';
import { INSTAGRAM_POSTS, InstagramPost } from '../data/mockData';

interface SocialSectionProps {
  onOpenPost: (post: InstagramPost) => void;
}

export const SocialSection: React.FC<SocialSectionProps> = ({ onOpenPost }) => {
  return (
    <section className="py-14 sm:py-16 bg-[#2A211B] text-white relative overflow-hidden">
      {/* Background subtle atmospheric glow */}
      <div className="absolute inset-0 bg-radial-gradient from-[#3D2E24] to-[#2A211B] opacity-50 pointer-events-none" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
          
          {/* Left Column: Heading, Subtitle & Follow Button */}
          <div className="lg:col-span-4 space-y-4">
            <span className="text-[11px] font-semibold tracking-[0.25em] text-[#C49A5A] uppercase block">
              NOSSO INSTAGRAM
            </span>
            
            <h2 className="font-serif-brand text-2xl sm:text-3xl lg:text-4xl font-normal text-white leading-tight">
              Acompanhe nossa rotina
            </h2>

            <p className="text-white/80 text-xs sm:text-sm font-light leading-relaxed">
              Novidades, dicas e muito mais!
            </p>

            <div className="pt-2">
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full border border-white/40 hover:border-white text-xs sm:text-sm font-medium text-white hover:bg-white hover:text-[#2A211B] transition-all duration-200 cursor-pointer group"
              >
                <Instagram className="w-4 h-4 transition-transform group-hover:scale-110" />
                <span>Seguir no Instagram</span>
                <ExternalLink className="w-3 h-3 opacity-60" />
              </a>
            </div>
          </div>

          {/* Right Column: 5 Instagram Gallery Tiles */}
          <div className="lg:col-span-8">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4">
              {INSTAGRAM_POSTS.map((post) => (
                <button
                  key={post.id}
                  onClick={() => onOpenPost(post)}
                  className="group relative aspect-square rounded-xl overflow-hidden bg-black/40 border border-white/10 hover:border-[#C49A5A] shadow-md transition-all duration-300 cursor-pointer focus:outline-none"
                  aria-label={post.alt}
                >
                  <img
                    src={post.image}
                    alt={post.alt}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    loading="lazy"
                  />
                  {/* Subtle hover overlay */}
                  <div className="absolute inset-0 bg-black/20 group-hover:bg-black/50 transition-colors flex items-center justify-center" />

                  {/* Top-right Instagram badge icon matching mockup */}
                  <div className="absolute top-2.5 right-2.5 w-6 h-6 rounded-full bg-black/40 backdrop-blur-xs flex items-center justify-center text-white/90 group-hover:text-white transition-colors">
                    <Instagram className="w-3.5 h-3.5" />
                  </div>

                  {/* Hover Caption Preview */}
                  <div className="absolute inset-x-2 bottom-2 text-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                    <span className="text-[10px] text-white font-medium drop-shadow bg-black/60 px-2 py-0.5 rounded-full">
                      Ver foto
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};
