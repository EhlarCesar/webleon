import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { BRAND_LOGO_PATH } from '../data/products';

interface SplashScreenProps {
  visible: boolean;
  onComplete: () => void;
}

export function SplashScreen({ visible, onComplete }: SplashScreenProps) {
  const [logoError, setLogoError] = useState(false);

  useEffect(() => {
    if (!visible) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const duration = prefersReducedMotion ? 700 : 2200;
    const timer = window.setTimeout(() => {
      onComplete();
    }, duration);

    return () => window.clearTimeout(timer);
  }, [visible, onComplete]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="leon-splash"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#090A0C] px-6 text-center"
          role="dialog"
          aria-modal="true"
          aria-label="Presentación de León Indumentaria"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center max-w-md w-full"
          >
            {/* Brand Emblem using user's exact uploaded logo */}
            <div className="relative w-40 h-40 sm:w-64 sm:h-64 flex items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-[#0D0E11]">
              {!logoError ? (
                <img
                  src={BRAND_LOGO_PATH}
                  alt="Emblema oficial de León Indumentaria"
                  referrerPolicy="no-referrer"
                  onError={() => setLogoError(true)}
                  className="w-full h-full object-cover scale-110"
                />
              ) : (
                <div className="flex flex-col items-center justify-center p-6">
                  <span className="font-display text-5xl font-semibold tracking-tight text-zinc-100">
                    León
                  </span>
                </div>
              )}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_48%,#090A0C_100%)]"
              />
            </div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="mt-6 flex flex-col items-center"
            >
              <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight text-white">
                León
              </h1>
              <p className="mt-1 text-sm sm:text-base tracking-[0.28em] uppercase text-zinc-400">
                Indumentaria
              </p>
              <p className="mt-4 text-xs sm:text-sm text-zinc-400">
                Indumentaria Masculina y Femenina · Envíos a domicilio
              </p>
            </motion.div>

            {/* Hairline loading progress */}
            <div className="mt-8 w-44 h-[1px] bg-white/15 overflow-hidden">
              <div className="h-full w-full origin-left bg-zinc-200 animate-splash-progress" />
            </div>

            <button
              type="button"
              onClick={onComplete}
              className="mt-6 inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-zinc-300 hover:text-white border border-white/15 hover:border-white/30 rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <span>Entrar al catálogo</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
