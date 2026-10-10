import React, { useEffect } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

interface ProductLightboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  images: string[];
  currentIndex: number;
  onSelectIndex: (index: number) => void;
  productName: string;
}

export const ProductLightboxModal: React.FC<ProductLightboxModalProps> = ({
  isOpen,
  onClose,
  images,
  currentIndex,
  onSelectIndex,
  productName,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') {
        onSelectIndex((currentIndex === 0 ? images.length - 1 : currentIndex - 1));
      }
      if (e.key === 'ArrowRight') {
        onSelectIndex((currentIndex + 1) % images.length);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentIndex, images.length, onClose, onSelectIndex]);

  if (!isOpen) return null;

  const handlePrev = () => {
    onSelectIndex(currentIndex === 0 ? images.length - 1 : currentIndex - 1);
  };

  const handleNext = () => {
    onSelectIndex((currentIndex + 1) % images.length);
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden bg-black/90 backdrop-blur-md flex flex-col items-center justify-between p-4 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label={`Galeria de fotos em tela cheia de ${productName}`}
    >
      {/* Top Header */}
      <div className="w-full max-w-5xl flex items-center justify-between text-white py-2">
        <div className="text-xs sm:text-sm font-medium text-white/80">
          <span>{productName}</span>
          <span className="mx-2 text-white/40">•</span>
          <span className="tabular-nums font-semibold text-white">
            {currentIndex + 1} de {images.length}
          </span>
        </div>
        <button
          onClick={onClose}
          aria-label="Fechar visualização em tela cheia"
          className="p-2 text-white/80 hover:text-white rounded-full hover:bg-white/10 transition-colors cursor-pointer"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Main Image Area with Controls */}
      <div className="relative flex-1 w-full max-w-4xl flex items-center justify-center py-4">
        {/* Previous Button */}
        <button
          onClick={handlePrev}
          aria-label="Foto anterior"
          className="absolute left-2 sm:left-4 z-10 p-3 rounded-full bg-black/40 hover:bg-black/80 text-white/90 hover:text-white transition-all cursor-pointer backdrop-blur-xs border border-white/10"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>

        {/* Big Image */}
        <div className="w-full h-full max-h-[70vh] flex items-center justify-center">
          <img
            src={images[currentIndex]}
            alt={`${productName} - foto ${currentIndex + 1}`}
            className="max-h-full max-w-full object-contain rounded-xl shadow-2xl select-none"
          />
        </div>

        {/* Next Button */}
        <button
          onClick={handleNext}
          aria-label="Próxima foto"
          className="absolute right-2 sm:right-4 z-10 p-3 rounded-full bg-black/40 hover:bg-black/80 text-white/90 hover:text-white transition-all cursor-pointer backdrop-blur-xs border border-white/10"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>

      {/* Bottom Thumbnail Strip */}
      <div className="w-full max-w-xl flex items-center justify-center gap-2.5 pb-2 overflow-x-auto py-2">
        {images.map((img, idx) => (
          <button
            key={idx}
            onClick={() => onSelectIndex(idx)}
            aria-label={`Ver foto ${idx + 1}`}
            className={`w-14 h-14 rounded-lg overflow-hidden border-2 transition-all cursor-pointer shrink-0 ${
              currentIndex === idx
                ? 'border-[#C49A5A] scale-105 opacity-100'
                : 'border-white/20 opacity-60 hover:opacity-100'
            }`}
          >
            <img src={img} alt="" className="w-full h-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
};
