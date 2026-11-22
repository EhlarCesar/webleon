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
      className="relative aspect-[4/3] w-full lg:aspect-auto lg:h-full lg:min-h-[430px] overflow-hidden rounded-xl border border-white/10 bg-[#13151A]"
      aria-roledescription="carousel"
      aria-label="Galería de Línea Masculina y Femenina"
    >
      {/* Automatic photo-only carousel transition */}
      {HERO_CAROUSEL_IMAGES.map((slide, index) => {
        const isActive = index === activeIndex;
        const hasFailed = Boolean(failedSlides[index]);

        return (
          <div
            key={slide.src}
            aria-hidden={!isActive}
            className={`absolute inset-0 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${
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
                className="h-full w-full object-cover object-center"
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

      {/* Contrast scrim */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-black/80 via-black/15 to-transparent"
      />

      {/* Fixed card overlay text */}
      <div className="absolute bottom-4 left-4 right-4 sm:bottom-5 sm:left-5 sm:right-5 z-20 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] sm:text-xs uppercase tracking-[0.14em] text-zinc-300">
            Catálogo oficial
          </p>
          <p className="mt-1 font-display text-lg sm:text-xl text-white">
            Línea Masculina &amp; Femenina
          </p>
        </div>
        <span className="text-xs font-medium text-zinc-200">Envíos a domicilio</span>
      </div>
    </div>
  );
}
