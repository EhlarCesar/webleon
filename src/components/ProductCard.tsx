import { useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { ClothingProduct, buildWhatsAppUrl } from '../data/products';
import { extractGoogleDriveFileId } from '../lib/googleSheets';

interface ProductCardProps {
  product: ClothingProduct;
}

export function ProductCard({ product }: ProductCardProps) {
  const [imageSrc, setImageSrc] = useState(product.image);
  const [triedFallback, setTriedFallback] = useState(false);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageSrc(product.image);
    setTriedFallback(false);
    setImageError(false);
  }, [product.image]);

  const handleImageError = () => {
    const driveId = extractGoogleDriveFileId(product.image);
    if (driveId && !triedFallback) {
      setTriedFallback(true);
      setImageSrc(`https://lh3.googleusercontent.com/d/${driveId}=w1200`);
      return;
    }
    setImageError(true);
  };

  const whatsappMessage = `Hola León Indumentaria, quiero consultar por "${product.name}": ${product.description}`;

  return (
    <article className="group flex flex-col justify-between rounded-xl border border-white/10 bg-[#13151A] overflow-hidden transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:border-white/20">
      {/* 1. Imagen de la ropa adaptable a cualquier tamaño */}
      <div className="relative w-full bg-[#181A20] overflow-hidden flex items-center justify-center">
        {imageSrc && !imageError ? (
          <img
            src={imageSrc}
            alt={product.name}
            referrerPolicy="no-referrer"
            onError={handleImageError}
            className="w-full h-auto max-h-[460px] object-contain transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex aspect-[3/4] w-full items-center justify-center p-6 text-center bg-gradient-to-b from-[#181A20] to-[#0E1014]">
            <span className="font-display text-lg text-zinc-400">{product.name}</span>
          </div>
        )}
      </div>

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
