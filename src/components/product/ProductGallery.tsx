import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Heart, Maximize2 } from 'lucide-react';
import { ProductLightboxModal } from './ProductLightboxModal';

interface ProductGalleryProps {
  images: string[];
  productName: string;
  isFavorite: boolean;
  onToggleFavorite: () => void;
}

export const ProductGallery: React.FC<ProductGalleryProps> = ({
  images,
  productName,
  isFavorite,
  onToggleFavorite,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  const handlePrev = () => {
    setActiveIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const handleNext = () => {
    setActiveIndex((prev) => (prev + 1) % images.length);
  };

  return (
    <div className="w-full flex flex-col md:flex-row gap-4 lg:gap-6 items-start">
      
      {/* 1. Vertical Thumbnail Strip (Desktop) */}
      <div className="hidden md:flex flex-col gap-3 shrink-0 w-20 lg:w-24">
        {images.map((img, idx) => {
          const isSelected = activeIndex === idx;

          return (
            <button
              key={idx}
              onClick={() => setActiveIndex(idx)}
              aria-label={`Ver imagem ${idx + 1} de ${images.length}`}
              aria-pressed={isSelected}
              className={`relative aspect-square w-full rounded-xl overflow-hidden bg-[#F1E8DC] border-2 transition-all duration-200 cursor-pointer ${
                isSelected
                  ? 'border-[#2A211B] shadow-sm scale-102 ring-1 ring-[#2A211B]'
                  : 'border-[#E7DED3] hover:border-[#C49A5A]/60 opacity-80 hover:opacity-100'
              }`}
            >
              <img
                src={img}
                alt={`${productName} miniatura ${idx + 1}`}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </button>
          );
        })}
      </div>

      {/* 2. Main Large Image Container */}
      <div className="relative flex-1 w-full aspect-square bg-[#F1E8DC] rounded-3xl overflow-hidden border border-[#E7DED3] group shadow-xs">
        
        {/* Main Image */}
        <img
          src={images[activeIndex]}
          alt={`${productName} foto principal`}
          className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-103 cursor-pointer"
          onClick={() => setIsLightboxOpen(true)}
        />

        {/* Favorite Heart Button in top-right corner */}
        <button
          onClick={onToggleFavorite}
          aria-label={isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
          className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/90 hover:bg-white backdrop-blur-xs flex items-center justify-center text-[#2A211B] transition-transform duration-200 hover:scale-110 shadow-sm cursor-pointer"
        >
          <Heart
            className={`w-5 h-5 transition-colors ${
              isFavorite ? 'fill-[#C49A5A] text-[#C49A5A]' : 'text-[#766D64] hover:text-[#2A211B]'
            }`}
          />
        </button>

        {/* Previous Navigation Button */}
        <button
          onClick={handlePrev}
          aria-label="Foto anterior"
          className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-white/90 hover:bg-white text-[#2A211B] shadow-md flex items-center justify-center transition-all opacity-80 hover:opacity-100 hover:scale-105 cursor-pointer"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        {/* Next Navigation Button */}
        <button
          onClick={handleNext}
          aria-label="Próxima foto"
          className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-white/90 hover:bg-white text-[#2A211B] shadow-md flex items-center justify-center transition-all opacity-80 hover:opacity-100 hover:scale-105 cursor-pointer"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        {/* Slide Indicator Dots at Bottom Center */}
        <div className="absolute bottom-4 inset-x-0 z-10 flex items-center justify-center gap-1.5">
          {images.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setActiveIndex(idx)}
              aria-label={`Ir para a foto ${idx + 1}`}
              className={`transition-all duration-300 rounded-full cursor-pointer ${
                activeIndex === idx
                  ? 'w-5 h-2 bg-[#2A211B] shadow-xs'
                  : 'w-2 h-2 bg-[#2A211B]/30 hover:bg-[#2A211B]/60'
              }`}
            />
          ))}
        </div>

        {/* Fullscreen Expand Icon Button at Bottom Right */}
        <button
          onClick={() => setIsLightboxOpen(true)}
          aria-label="Expandir fotos em tela cheia"
          className="absolute bottom-4 right-4 z-10 w-9 h-9 rounded-full bg-white/90 hover:bg-white text-[#2A211B] shadow-md flex items-center justify-center transition-transform hover:scale-110 cursor-pointer"
          title="Ver fotos em tela cheia"
        >
          <Maximize2 className="w-4 h-4" />
        </button>

      </div>

      {/* Mobile Horizontal Thumbnail Bar (under main image) */}
      <div className="flex md:hidden gap-2.5 overflow-x-auto w-full pb-2 pt-1 no-scrollbar">
        {images.map((img, idx) => (
          <button
            key={idx}
            onClick={() => setActiveIndex(idx)}
            className={`w-16 h-16 rounded-xl overflow-hidden bg-[#F1E8DC] border-2 shrink-0 transition-all ${
              activeIndex === idx
                ? 'border-[#2A211B] scale-105'
                : 'border-[#E7DED3] opacity-70'
            }`}
          >
            <img src={img} alt="" className="w-full h-full object-cover" />
          </button>
        ))}
      </div>

      {/* Lightbox Modal */}
      <ProductLightboxModal
        isOpen={isLightboxOpen}
        onClose={() => setIsLightboxOpen(false)}
        images={images}
        currentIndex={activeIndex}
        onSelectIndex={setActiveIndex}
        productName={productName}
      />

    </div>
  );
};
