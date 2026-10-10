import React, { useState, useEffect } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { HERO_SLIDES } from '../data/mockData';

interface HeroCarouselProps {
  onExploreClick: () => void;
}

export const HeroCarousel: React.FC<HeroCarouselProps> = ({ onExploreClick }) => {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const currentSlide = HERO_SLIDES[currentSlideIndex];

  // Auto rotate slides every 6 seconds if not paused
  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      setCurrentSlideIndex((prev) => (prev + 1) % HERO_SLIDES.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [isPaused]);

  const handlePrev = () => {
    setCurrentSlideIndex((prev) => (prev === 0 ? HERO_SLIDES.length - 1 : prev - 1));
  };

  const handleNext = () => {
    setCurrentSlideIndex((prev) => (prev + 1) % HERO_SLIDES.length);
  };

  return (
    <section
      aria-label="Destaque principal da coleção Lola"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className="relative w-full overflow-hidden bg-[#2A211B] min-h-[460px] sm:min-h-[540px] lg:min-h-[620px] flex items-center"
    >
      {/* Background Image with optimized focal point */}
      <div className="absolute inset-0 z-0">
        <img
          src={currentSlide.image}
          alt={currentSlide.title}
          className="w-full h-full object-cover object-[center_28%] transition-transform duration-1000 ease-out scale-100"
        />
        {/* Soft gradient overlays to ensure absolute text contrast matching mockup */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#2A211B]/85 via-[#2A211B]/40 to-transparent sm:via-[#2A211B]/30" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#2A211B]/60 via-transparent to-black/20" />
      </div>

      {/* Main Content Container */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full py-12 lg:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          
          {/* Left Column: Brand, Headline, Subtitle, CTA */}
          <div className="lg:col-span-7 xl:col-span-6 space-y-5 sm:space-y-6">
            
            {/* Brand watermark inside hero matching design 01 */}
            <div className="space-y-0.5">
              <span className="font-serif-brand text-2xl sm:text-3xl lg:text-4xl font-normal tracking-wider text-[#F8F4ED]">
                LOLA
              </span>
              <p className="text-[10px] sm:text-xs tracking-[0.3em] font-medium text-[#DCC7B0] uppercase">
                Aço Inox & Acessórios
              </p>
            </div>

            {/* Editorial Serif Headline */}
            <h1 className="font-serif-brand text-3xl sm:text-5xl lg:text-6xl font-normal text-white leading-[1.1] tracking-tight drop-shadow-sm text-balance">
              {currentSlide.title}
            </h1>

            {/* Supporting description */}
            <p className="text-white/90 text-sm sm:text-base lg:text-lg font-light leading-relaxed max-w-md">
              {currentSlide.subtitle}
            </p>

            {/* CTA Button */}
            <div className="pt-2">
              <button
                onClick={onExploreClick}
                className="group inline-flex items-center gap-2.5 px-6 sm:px-8 py-3.5 sm:py-4 rounded-full bg-[#2A211B] text-[#F8F4ED] hover:bg-[#1E1713] hover:text-[#C49A5A] transition-all duration-200 text-xs sm:text-sm font-semibold tracking-wider uppercase shadow-xl hover:shadow-2xl hover:scale-[1.02] active:scale-100 cursor-pointer border border-[#C49A5A]/30"
              >
                <span>{currentSlide.ctaText}</span>
                <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
              </button>
            </div>
          </div>

          {/* Right Column: Editorial Handwritten Script */}
          <div className="hidden lg:flex lg:col-span-5 xl:col-span-6 justify-end items-center pr-4">
            <div className="text-right space-y-2 max-w-xs animate-in fade-in duration-500">
              <p className="font-script text-3xl xl:text-4xl text-[#F8F4ED] drop-shadow leading-relaxed select-none">
                &ldquo;{currentSlide.scriptText}&rdquo;
              </p>
              <div className="w-20 h-[1.5px] bg-[#DCC7B0]/60 ml-auto" />
            </div>
          </div>

        </div>
      </div>

      {/* Subtle Slide Navigation Controls on bottom-right (matching 3 dots in mockup) */}
      <div className="absolute bottom-6 right-6 sm:bottom-8 sm:right-10 z-20 flex items-center gap-2">
        {HERO_SLIDES.map((slide, index) => (
          <button
            key={slide.id}
            onClick={() => setCurrentSlideIndex(index)}
            aria-label={`Ir para slide ${index + 1}`}
            className={`transition-all duration-300 rounded-full cursor-pointer ${
              currentSlideIndex === index
                ? 'w-6 h-2.5 bg-white shadow-md'
                : 'w-2.5 h-2.5 bg-white/40 hover:bg-white/80'
            }`}
          />
        ))}
      </div>

      {/* Discrete prev/next buttons on sides for accessibility */}
      <button
        onClick={handlePrev}
        aria-label="Slide anterior"
        className="absolute left-2 top-1/2 -translate-y-1/2 z-20 p-2 text-white/50 hover:text-white transition-colors cursor-pointer hidden sm:block"
      >
        <ChevronLeft className="w-6 h-6" />
      </button>
      <button
        onClick={handleNext}
        aria-label="Próximo slide"
        className="absolute right-2 top-1/2 -translate-y-1/2 z-20 p-2 text-white/50 hover:text-white transition-colors cursor-pointer hidden sm:block"
      >
        <ChevronRight className="w-6 h-6" />
      </button>
    </section>
  );
};
