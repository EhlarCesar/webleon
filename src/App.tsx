import { useCallback, useEffect, useState } from 'react';
import { ArrowDown, MessageCircle, RotateCcw } from 'lucide-react';
import {
  ClothingProduct,
  DEFAULT_PRODUCTS,
  DEFAULT_SPREADSHEET_ID,
  WHATSAPP_DISPLAY,
  WHATSAPP_SHORT,
  buildWhatsAppUrl,
  normalizeProductImages,
} from './data/products';
import { SplashScreen } from './components/SplashScreen';
import { ProductCard } from './components/ProductCard';
import { AdminPage } from './components/AdminPage';
import { HeroCarousel } from './components/HeroCarousel';
import { extractSpreadsheetId, fetchPublicSheetProducts } from './lib/googleSheets';

const STORAGE_PRODUCTS_KEY = 'leon_synced_products';
const STORAGE_SHEET_URL_KEY = 'leon_sheet_url';
const STORAGE_SHEET_TAB_KEY = 'leon_sheet_tab';

function isAdminLocation(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.location.hash === '#admin' ||
    window.location.pathname.replace(/\/+$/, '') === '/admin'
  );
}

function loadCachedProducts(): ClothingProduct[] {
  try {
    const raw = localStorage.getItem(STORAGE_PRODUCTS_KEY);
    if (!raw) return DEFAULT_PRODUCTS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return normalizeProductImages(parsed);
    }
  } catch {
    // Ignore storage read errors
  }
  return DEFAULT_PRODUCTS;
}

export default function App() {
  const [isAdminRoute, setIsAdminRoute] = useState<boolean>(isAdminLocation);
  const [showSplash, setShowSplash] = useState<boolean>(() => !isAdminLocation());

  const [products, setProducts] = useState<ClothingProduct[]>(loadCachedProducts);

  // Sync route changes (#admin / #inicio)
  useEffect(() => {
    const handleRouteChange = () => {
      const admin = isAdminLocation();
      setIsAdminRoute(admin);
      if (admin) {
        setShowSplash(false);
      }
    };

    window.addEventListener('hashchange', handleRouteChange);
    window.addEventListener('popstate', handleRouteChange);
    return () => {
      window.removeEventListener('hashchange', handleRouteChange);
      window.removeEventListener('popstate', handleRouteChange);
    };
  }, []);

  // Load live catalog from ?sheet=ID, saved sheet ID, or DEFAULT_SPREADSHEET_ID
  const refreshFromPublicSheet = useCallback(async () => {
    const params = new URLSearchParams(window.location.search);
    const sheetParam =
      params.get('sheet') ||
      (() => {
        try {
          return localStorage.getItem(STORAGE_SHEET_URL_KEY) || DEFAULT_SPREADSHEET_ID;
        } catch {
          return DEFAULT_SPREADSHEET_ID;
        }
      })();

    const spreadsheetId = extractSpreadsheetId(sheetParam);
    if (!spreadsheetId) return;

    const tabParam =
      params.get('tab') ||
      (() => {
        try {
          return localStorage.getItem(STORAGE_SHEET_TAB_KEY) || undefined;
        } catch {
          return undefined;
        }
      })();

    try {
      const rows = await fetchPublicSheetProducts(spreadsheetId, tabParam);
      if (rows.length > 0) {
        setProducts(
          rows.map(({ id, name, images, description }) => ({ id, name, images, description }))
        );
      }
    } catch {
      // Keep cached or default catalog if sheet is not public yet
    }
  }, []);

  useEffect(() => {
    refreshFromPublicSheet();
  }, [refreshFromPublicSheet]);

  const handleAdminSyncProducts = useCallback(
    (
      synced: ClothingProduct[],
      _sourceLabel: string,
      spreadsheetId: string,
      tabTitle: string
    ) => {
      setProducts(synced);
      try {
        localStorage.setItem(STORAGE_PRODUCTS_KEY, JSON.stringify(synced));
        localStorage.setItem(STORAGE_SHEET_URL_KEY, spreadsheetId);
        localStorage.setItem(STORAGE_SHEET_TAB_KEY, tabTitle);
      } catch {
        // Ignore storage errors
      }

      const url = new URL(window.location.href);
      url.searchParams.set('sheet', spreadsheetId);
      url.searchParams.set('tab', tabTitle);
      window.history.replaceState({}, '', url.toString());
    },
    []
  );

  const navigateToAdmin = () => {
    window.location.hash = '#admin';
    setIsAdminRoute(true);
    setShowSplash(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToStorefront = () => {
    window.location.hash = '#inicio';
    setIsAdminRoute(false);
    refreshFromPublicSheet();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (isAdminRoute) {
    return (
      <AdminPage
        onSyncProducts={handleAdminSyncProducts}
        onGoToStorefront={navigateToStorefront}
      />
    );
  }

  const generalWhatsAppUrl = buildWhatsAppUrl(
    'Hola León Indumentaria, quiero consultar por el catálogo de prendas.'
  );

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#0B0C0F] text-[#F3F4F6]">
      <SplashScreen visible={showSplash} onComplete={() => setShowSplash(false)} />

      {/* 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0B0C0F]/92 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 sm:gap-8 px-4 sm:px-6 lg:px-8">
          <a
            href="#inicio"
            className="font-display text-lg sm:text-xl font-semibold tracking-tight text-white whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 rounded"
          >
            León Indumentaria
          </a>

          <nav
            aria-label="Navegación principal"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-zinc-400"
          >
            <a
              href="#inicio"
              className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Inicio
            </a>
            <a
              href="#envios"
              className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Envíos
            </a>
            <a
              href="#coleccion"
              className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Colección
            </a>
          </nav>

          <div className="flex items-center shrink-0">
            <a
              href={generalWhatsAppUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 sm:gap-2 rounded-lg bg-[#22C55E] px-3 py-2 sm:px-4 text-xs font-semibold text-zinc-950 transition-colors hover:bg-[#16A34A] whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E]"
            >
              <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{WHATSAPP_SHORT}</span>
            </a>
          </div>
        </div>
      </header>

      <main id="inicio">
        {/* Hero Split Section */}
        <section className="mx-auto max-w-7xl px-4 pt-8 pb-12 sm:px-6 sm:pt-10 sm:pb-14 lg:px-8 lg:pt-14 lg:pb-16">
          <div className="grid grid-cols-1 gap-8 sm:gap-10 lg:grid-cols-12 lg:gap-12 items-stretch">
            <div className="flex flex-col justify-center lg:col-span-6">
              <p className="text-xs uppercase tracking-[0.16em] sm:tracking-[0.18em] text-zinc-400">
                Indumentaria Masculina y Femenina
              </p>

              <h1 className="mt-3 sm:mt-4 font-display text-3xl sm:text-5xl lg:text-[3.5rem] font-semibold leading-[1.1] tracking-tight text-white [text-wrap:balance]">
                Indumentaria masculina y femenina con presencia.
              </h1>

              <p className="mt-4 sm:mt-5 max-w-xl text-sm sm:text-base leading-relaxed text-zinc-300">
                Seleccionamos prendas urbanas y sastrería casual para hombre y mujer con curva
                completa de talles. Atención personalizada por WhatsApp y envíos a domicilio.
              </p>

              <div className="mt-7 sm:mt-8 flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3 sm:gap-4">
                <a
                  href={generalWhatsAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-lg bg-[#22C55E] px-6 py-3 text-sm font-semibold text-zinc-950 transition-colors hover:bg-[#16A34A] whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E]"
                >
                  <MessageCircle className="h-4 w-4" aria-hidden="true" />
                  <span>Escribir al {WHATSAPP_SHORT}</span>
                </a>

                <a
                  href="#coleccion"
                  className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-lg border border-white/15 bg-[#13151A] px-5 py-3 text-sm font-medium text-zinc-200 transition-colors hover:border-white/30 hover:text-white whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                >
                  <span>Ver catálogo</span>
                  <ArrowDown className="h-4 w-4" aria-hidden="true" />
                </a>
              </div>
            </div>

            <div className="lg:col-span-6">
              <HeroCarousel />
            </div>
          </div>

          <div
            id="envios"
            className="mt-12 border-y border-white/10 py-7"
          >
            <h2 className="text-sm font-semibold text-white">Envíos a domicilio</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
              Coordinamos tu despacho o cualquier punto de encuentro.
            </p>
          </div>
        </section>

        {/* Clean Clothing Cards Section: Image + Title + Description + WhatsApp Button */}
        <section
          id="coleccion"
          className="mx-auto max-w-7xl px-4 pt-6 pb-16 sm:px-6 lg:px-8 lg:pb-20"
        >
          <div className="border-b border-white/10 pb-6">
            <p className="text-xs uppercase tracking-[0.16em] text-zinc-400">
              Catálogo de prendas
            </p>
            <h2 className="mt-2 font-display text-3xl sm:text-4xl font-semibold text-white">
              Prendas disponibles
            </h2>
          </div>

          {products.length === 0 ? (
            <div className="mt-8 rounded-xl border border-white/10 bg-[#13151A] p-8 text-center text-sm text-zinc-400">
              No hay prendas cargadas en este momento.
            </div>
          ) : (
            <div className="mt-8 grid grid-cols-1 items-start gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-white/10 bg-[#0B0C0F]">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-4 py-8 sm:flex-row sm:items-center sm:px-6 lg:px-8">
          <div>
            <span className="font-display text-lg font-semibold text-white">
              León Indumentaria
            </span>
            <p className="mt-1 text-xs text-zinc-400">
              Indumentaria Masculina y Femenina · Envíos a domicilio
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-5 text-xs text-zinc-400">
            <a
              href={generalWhatsAppUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-200 hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap"
            >
              WhatsApp {WHATSAPP_DISPLAY}
            </a>
            <button
              type="button"
              onClick={() => setShowSplash(true)}
              className="inline-flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors whitespace-nowrap"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Ver presentación</span>
            </button>
            <button
              type="button"
              onClick={navigateToAdmin}
              className="text-zinc-400 hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap"
            >
              Administrador
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
