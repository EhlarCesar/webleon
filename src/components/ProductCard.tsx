import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, MessageCircle } from 'lucide-react';
import { ClothingProduct, buildWhatsAppUrl } from '../data/products';
import { extractGoogleDriveFileId } from '../lib/googleSheets';

interface SwipeableProductGalleryProps {
  images: string[];
  alt: string;
}

export function SwipeableProductGallery({ images, alt }: SwipeableProductGalleryProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Touch swipe refs
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchDirection = useRef<'horizontal' | 'vertical' | null>(null);
  const latestTouchDx = useRef<number>(0);

  // Mouse drag refs
  const mouseStartX = useRef<number | null>(null);
  const didMouseDrag = useRef(false);

  const imagesKey = images.join('|');
  const [activeIndex, setActiveIndex] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const [resolvedSrcs, setResolvedSrcs] = useState<string[]>(images);
  const [triedFallback, setTriedFallback] = useState<Record<number, boolean>>({});
  const [failedImages, setFailedImages] = useState<Record<number, boolean>>({});

  useEffect(() => {
    setResolvedSrcs(images);
    setTriedFallback({});
    setFailedImages({});
    setActiveIndex(0);
    setDragOffset(0);
    setIsDragging(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imagesKey]);

  const total = resolvedSrcs.length;
  const canSwipe = total > 1;
  const safeIndex = Math.min(activeIndex, Math.max(0, total - 1));

  const goToSlide = useCallback(
    (nextIndex: number) => {
      if (total <= 1) return;
      const clamped = Math.max(0, Math.min(total - 1, nextIndex));
      setActiveIndex(clamped);
      setDragOffset(0);
      setIsDragging(false);
    },
    [total]
  );

  const handleImageError = (index: number) => {
    const original = images[index] || '';
    const driveId = extractGoogleDriveFileId(original);
    if (driveId && !triedFallback[index]) {
      setTriedFallback((prev) => ({ ...prev, [index]: true }));
      setResolvedSrcs((prev) => {
        const next = [...prev];
        next[index] = `https://lh3.googleusercontent.com/d/${driveId}=w1200`;
        return next;
      });
      return;
    }
    setFailedImages((prev) => ({ ...prev, [index]: true }));
  };

  // Apply edge resistance so the user feels the boundary when swiping past first/last photo
  const computeBoundedOffset = useCallback(
    (rawDx: number) => {
      if (
        (safeIndex === 0 && rawDx > 0) ||
        (safeIndex === total - 1 && rawDx < 0)
      ) {
        return rawDx * 0.25;
      }
      return rawDx;
    },
    [safeIndex, total]
  );

  const finalizeSwipe = useCallback(
    (dx: number) => {
      const width = containerRef.current?.clientWidth || 300;
      const threshold = Math.min(55, width * 0.16);
      if (dx < -threshold && safeIndex < total - 1) {
        goToSlide(safeIndex + 1);
      } else if (dx > threshold && safeIndex > 0) {
        goToSlide(safeIndex - 1);
      } else {
        setDragOffset(0);
        setIsDragging(false);
      }
    },
    [goToSlide, safeIndex, total]
  );

  // Mobile / tablet finger swipe handlers
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!canSwipe || e.touches.length !== 1) return;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchDirection.current = null;
    latestTouchDx.current = 0;
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!canSwipe || touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;

    if (touchDirection.current === null) {
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
        touchDirection.current = Math.abs(dx) >= Math.abs(dy) ? 'horizontal' : 'vertical';
        if (touchDirection.current === 'horizontal') {
          setIsDragging(true);
        }
      }
    }

    if (touchDirection.current === 'horizontal') {
      const bounded = computeBoundedOffset(dx);
      latestTouchDx.current = bounded;
      setDragOffset(bounded);
    }
  };

  const handleTouchEnd = () => {
    if (touchDirection.current === 'horizontal') {
      finalizeSwipe(latestTouchDx.current);
    } else {
      setDragOffset(0);
      setIsDragging(false);
    }
    touchStartX.current = null;
    touchStartY.current = null;
    touchDirection.current = null;
    latestTouchDx.current = 0;
  };

  // Desktop mouse drag handlers (attached to window while dragging for smooth follow)
  useEffect(() => {
    if (!isDragging || mouseStartX.current === null) return;

    const handleWindowMouseMove = (e: MouseEvent) => {
      if (mouseStartX.current === null) return;
      const dx = e.clientX - mouseStartX.current;
      if (Math.abs(dx) > 4) {
        didMouseDrag.current = true;
      }
      setDragOffset(computeBoundedOffset(dx));
    };

    const handleWindowMouseUp = (e: MouseEvent) => {
      if (mouseStartX.current === null) return;
      const dx = e.clientX - mouseStartX.current;
      mouseStartX.current = null;
      finalizeSwipe(computeBoundedOffset(dx));
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [isDragging, computeBoundedOffset, finalizeSwipe]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canSwipe || e.button !== 0) return;
    // Don't start drag when clicking nav buttons or slide indicators
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    mouseStartX.current = e.clientX;
    didMouseDrag.current = false;
    setIsDragging(true);
  };

  if (total === 0) {
    return (
      <div className="flex aspect-[3/4] w-full items-center justify-center bg-gradient-to-b from-[#181A20] to-[#0E1014] p-6 text-center">
        <span className="font-display text-lg text-zinc-400">{alt}</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onMouseDown={handleMouseDown}
      style={{ touchAction: canSwipe ? 'pan-y' : 'auto' }}
      className={`relative w-full bg-[#181A20] overflow-hidden select-none ${
        canSwipe ? 'cursor-grab active:cursor-grabbing' : ''
      }`}
    >
      {/* Sliding track */}
      <div
        className={`flex w-full items-center ${
          isDragging ? '' : 'transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]'
        }`}
        style={{
          transform: `translate3d(calc(-${safeIndex * 100}% + ${dragOffset}px), 0, 0)`,
        }}
      >
        {resolvedSrcs.map((src, index) => (
          <div
            key={`${src}-${index}`}
            className="w-full shrink-0 flex items-center justify-center bg-[#181A20]"
          >
            {!failedImages[index] ? (
              <img
                src={src}
                alt={canSwipe ? `${alt} (${index + 1}/${total})` : alt}
                referrerPolicy="no-referrer"
                draggable={false}
                onError={() => handleImageError(index)}
                className="w-full h-auto max-h-[460px] object-contain pointer-events-none select-none"
              />
            ) : (
              <div className="flex aspect-[3/4] w-full items-center justify-center bg-gradient-to-b from-[#181A20] to-[#0E1014] p-6 text-center">
                <span className="font-display text-lg text-zinc-400">{alt}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Subtle counter + controls when card has 2 photos */}
      {canSwipe && (
        <>
          <div className="pointer-events-none absolute top-2.5 right-2.5 z-10 rounded-md bg-black/65 px-2 py-0.5 text-[11px] font-medium text-white/95 backdrop-blur-sm tabular-nums">
            {safeIndex + 1} / {total}
          </div>

          {safeIndex > 0 && (
            <button
              type="button"
              aria-label="Foto anterior"
              onClick={(e) => {
                e.stopPropagation();
                goToSlide(safeIndex - 1);
              }}
              className="absolute left-2 top-1/2 -translate-y-1/2 z-10 flex h-8 w-8 items-center justify-center rounded-lg bg-black/55 text-white/90 backdrop-blur-sm transition-colors hover:bg-black/80"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
          )}

          {safeIndex < total - 1 && (
            <button
              type="button"
              aria-label="Siguiente foto"
              onClick={(e) => {
                e.stopPropagation();
                goToSlide(safeIndex + 1);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 z-10 flex h-8 w-8 items-center justify-center rounded-lg bg-black/55 text-white/90 backdrop-blur-sm transition-colors hover:bg-black/80"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          )}

          <div
            className="absolute bottom-2.5 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 rounded-md bg-black/55 px-2.5 py-1.5 backdrop-blur-sm"
            role="tablist"
            aria-label="Fotos de la prenda"
          >
            {resolvedSrcs.map((_, index) => (
              <button
                key={index}
                type="button"
                role="tab"
                aria-selected={index === safeIndex}
                aria-label={`Ver foto ${index + 1}`}
                onClick={(e) => {
                  e.stopPropagation();
                  goToSlide(index);
                }}
                className={`h-1.5 rounded-sm transition-all duration-200 ${
                  index === safeIndex ? 'w-6 bg-white' : 'w-2.5 bg-white/45 hover:bg-white/75'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

interface ProductCardProps {
  product: ClothingProduct;
}

export function ProductCard({ product }: ProductCardProps) {
  const whatsappMessage = `Hola León Indumentaria, quiero consultar por "${product.name}": ${product.description}`;

  return (
    <article className="group flex flex-col justify-between rounded-xl border border-white/10 bg-[#13151A] overflow-hidden transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:border-white/20">
      {/* 1. 1 o 2 imágenes deslizables con la mano */}
      <SwipeableProductGallery images={product.images} alt={product.name} />

      {/* 2. Nombre del producto + 3. Descripción + 4. Botón de WhatsApp */}
      <div className="flex flex-1 flex-col justify-between gap-4 p-5">
        <div>
          <h3 className="text-base font-semibold text-white">{product.name}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-zinc-300">{product.description}</p>
        </div>

        <a
          href={buildWhatsAppUrl(whatsappMessage)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#22C55E] px-4 py-2.5 text-xs font-semibold text-zinc-950 transition-colors hover:bg-[#16A34A] whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E]"
        >
          <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Consultar por WhatsApp</span>
        </a>
      </div>
    </article>
  );
}
