import { useEffect, useState } from 'react';
import { HERO_CAROUSEL_IMAGES } from '../data/products';

export function HeroCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [failedSlides, setFailedSlides] = useState<Record<number, boolean>>({});

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % HERO_CAROUSEL_IMAGES.length);
    }, 3500);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <div
      className="flex flex-col w-full h-full overflow-hidden rounded-xl border border-white/10 bg-[#13151A]"
      aria-roledescription="carousel"
      aria-label="Galería de Línea Masculina y Femenina"
    >
      {/* Responsive photo-only automatic carousel (adapts cleanly to mobile, tablet & desktop without cropping) */}
      <div className="relative w-full aspect-[4/5] sm:aspect-square lg:aspect-auto lg:flex-1 lg:min-h-[420px] xl:min-h-[460px] overflow-hidden bg-[#0E1014]">
        {HERO_CAROUSEL_IMAGES.map((slide, index) => {
          const isActive = index === activeIndex;
          const hasFailed = Boolean(failedSlides[index]);

          return (
            <div
              key={slide.src}
              aria-hidden={!isActive}
              className={`absolute inset-0 flex items-center justify-center p-2 sm:p-3 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                isActive
                  ? 'opacity-100 scale-100'
                  : 'opacity-0 scale-[1.03] pointer-events-none'
              }`}
            >
              {!hasFailed ? (
                <img
                  src={slide.src}
                  alt={slide.alt}
                  referrerPolicy="no-referrer"
                  onError={() =>
                    setFailedSlides((prev) => ({
                      ...prev,
                      [index]: true,
                    }))
                  }
                  className="h-full w-full max-h-full max-w-full object-contain select-none"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-[#181A20] to-[#0B0C0F]">
                  <span className="font-display text-2xl sm:text-3xl text-white">
                    León Indumentaria
                  </span>
                  <span className="mt-2 text-xs sm:text-sm text-zinc-400">
                    Indumentaria Masculina y Femenina
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Fixed card bottom strip without "Catálogo oficial" */}
      <div className="border-t border-white/10 bg-[#13151A] px-4 py-3.5 sm:px-5 sm:py-4 flex flex-wrap items-center justify-between gap-2">
        <p className="font-display text-base sm:text-lg lg:text-xl text-white">
          Línea Masculina &amp; Femenina
        </p>
        <span className="text-xs font-medium text-zinc-300">Envíos a domicilio</span>
      </div>
    </div>
  );
}
