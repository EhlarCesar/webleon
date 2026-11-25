import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  ExternalLink,
  FilePlus2,
  FileSpreadsheet,
  ImagePlus,
  LogOut,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import {
  getAccessToken,
  googleSignIn,
  initAuth,
  logout,
} from '../lib/googleAuth';
import {
  appendSheetProduct,
  createCatalogSpreadsheet,
  deleteSheetProductRow,
  extractSpreadsheetId,
  fetchSheetProducts,
  fetchSpreadsheetMetadata,
  normalizeSheetImageUrl,
  uploadImageToDrive,
  type SheetProductRow,
  type SheetTabInfo,
} from '../lib/googleSheets';
import {
  DEFAULT_SPREADSHEET_ID,
  WHATSAPP_SHORT,
  buildWhatsAppUrl,
  type ClothingProduct,
} from '../data/products';
import { GoogleSignInButton } from './GoogleSignInButton';
import { ConfirmActionModal } from './ConfirmActionModal';
import { SwipeableProductGallery } from './ProductCard';

interface AdminPageProps {
  onSyncProducts: (products: ClothingProduct[], sourceLabel: string, spreadsheetId: string, tabTitle: string) => void;
  onGoToStorefront: () => void;
}

const STORAGE_SHEET_URL_KEY = 'leon_sheet_url';
const STORAGE_SHEET_TAB_KEY = 'leon_sheet_tab';

const AUTHORIZED_ADMIN_EMAILS = new Set([
  'ehlar.cesar@gmail.com',
  'alexiscenturion081@gmail.com',
]);

function isAuthorizedAdmin(email?: string | null): boolean {
  if (!email) return false;
  return AUTHORIZED_ADMIN_EMAILS.has(email.trim().toLowerCase());
}

type PendingMutation =
  | {
      type: 'add';
      title: string;
      description: string;
      image1File: File | null;
      image1Url: string;
      image2File: File | null;
      image2Url: string;
    }
  | { type: 'delete'; item: SheetProductRow }
  | null;

export function AdminPage({ onSyncProducts, onGoToStorefront }: AdminPageProps) {
  const [user, setUser] = useState<User | null>(null);
  const [needsAuth, setNeedsAuth] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [sheetInput, setSheetInput] = useState(() => {
    try {
      const urlSheet = new URLSearchParams(window.location.search).get('sheet');
      return urlSheet || localStorage.getItem(STORAGE_SHEET_URL_KEY) || DEFAULT_SPREADSHEET_ID;
    } catch {
      return DEFAULT_SPREADSHEET_ID;
    }
  });
  const [spreadsheetTitle, setSpreadsheetTitle] = useState('');
  const [availableTabs, setAvailableTabs] = useState<SheetTabInfo[]>([]);
  const [selectedTabTitle, setSelectedTabTitle] = useState(() => {
    try {
      const urlTab = new URLSearchParams(window.location.search).get('tab');
      return urlTab || localStorage.getItem(STORAGE_SHEET_TAB_KEY) || '';
    } catch {
      return '';
    }
  });

  const [sheetRows, setSheetRows] = useState<SheetProductRow[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCreatingSheet, setIsCreatingSheet] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [copiedClientLink, setCopiedClientLink] = useState(false);

  // New card form state (1 or 2 images)
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newImage1Url, setNewImage1Url] = useState('');
  const [newImage1File, setNewImage1File] = useState<File | null>(null);
  const [file1PreviewUrl, setFile1PreviewUrl] = useState<string | null>(null);

  const [newImage2Url, setNewImage2Url] = useState('');
  const [newImage2File, setNewImage2File] = useState<File | null>(null);
  const [file2PreviewUrl, setFile2PreviewUrl] = useState<string | null>(null);

  const file1InputRef = useRef<HTMLInputElement>(null);
  const file2InputRef = useRef<HTMLInputElement>(null);

  // Explicit confirmation modal state (mandatory before any Workspace mutation)
  const [pendingMutation, setPendingMutation] = useState<PendingMutation>(null);
  const [isMutating, setIsMutating] = useState(false);

  useEffect(() => {
    const unsubscribe = initAuth(
      (authedUser) => {
        if (!isAuthorizedAdmin(authedUser.email)) {
          void logout();
          setUser(null);
          setNeedsAuth(true);
          setErrorMsg(
            `La cuenta ${authedUser.email || ''} no tiene autorización para ingresar al Administrador.`
          );
          return;
        }
        setUser(authedUser);
        setNeedsAuth(false);
      },
      () => {
        setUser(null);
        setNeedsAuth(true);
      }
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    return () => {
      if (file1PreviewUrl) {
        URL.revokeObjectURL(file1PreviewUrl);
      }
    };
  }, [file1PreviewUrl]);

  useEffect(() => {
    return () => {
      if (file2PreviewUrl) {
        URL.revokeObjectURL(file2PreviewUrl);
      }
    };
  }, [file2PreviewUrl]);

  const loadSheetData = useCallback(
    async (explicitInput?: string, explicitTab?: string) => {
      const token = getAccessToken();
      if (!token) {
        setNeedsAuth(true);
        setErrorMsg('Iniciá sesión con Google para administrar tu planilla.');
        return;
      }

      const rawInput = explicitInput ?? sheetInput;
      const spreadsheetId = extractSpreadsheetId(rawInput);
      if (!spreadsheetId) {
        setErrorMsg('Pegá un enlace o ID válido de Google Sheets, o creá una planilla nueva.');
        return;
      }

      setIsSyncing(true);
      setErrorMsg(null);

      try {
        localStorage.setItem(STORAGE_SHEET_URL_KEY, rawInput.trim());

        const meta = await fetchSpreadsheetMetadata(spreadsheetId, token);
        setSpreadsheetTitle(meta.title);
        setAvailableTabs(meta.sheets);

        if (meta.sheets.length === 0) {
          throw new Error('La planilla no tiene pestañas.');
        }

        const matchedTab =
          (explicitTab && meta.sheets.find((t) => t.title === explicitTab)) ||
          (selectedTabTitle && meta.sheets.find((t) => t.title === selectedTabTitle)) ||
          meta.sheets[0];

        setSelectedTabTitle(matchedTab.title);
        localStorage.setItem(STORAGE_SHEET_TAB_KEY, matchedTab.title);

        const rows = await fetchSheetProducts(spreadsheetId, matchedTab.title, token);
        setSheetRows(rows);
        onSyncProducts(
          rows.map(({ id, name, images, description }) => ({ id, name, images, description })),
          `${meta.title} · ${matchedTab.title}`,
          spreadsheetId,
          matchedTab.title
        );
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : 'No se pudo cargar la información de Google Sheets.'
        );
      } finally {
        setIsSyncing(false);
      }
    },
    [sheetInput, selectedTabTitle, onSyncProducts]
  );

  // Auto-load sheet right after signing in if a sheet ID is already present
  useEffect(() => {
    if (!needsAuth && sheetInput.trim() && extractSpreadsheetId(sheetInput)) {
      loadSheetData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsAuth]);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setErrorMsg(null);
    try {
      const result = await googleSignIn();
      if (!isAuthorizedAdmin(result.user.email)) {
        await logout();
        setUser(null);
        setNeedsAuth(true);
        setErrorMsg(
          `La cuenta ${result.user.email || ''} no tiene autorización para ingresar al Administrador.`
        );
        return;
      }
      setUser(result.user);
      setNeedsAuth(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'No se pudo iniciar sesión con Google.';
      if (message.includes('auth/unauthorized-domain')) {
        setErrorMsg(
          'Este dominio (por ej. leonedlp.netlify.app) todavía no está autorizado en Firebase Console → Authentication → Settings → Authorized domains.'
        );
      } else {
        setErrorMsg(message);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setNeedsAuth(true);
  };

  const handleCreateSpreadsheet = async () => {
    const token = getAccessToken();
    if (!token) {
      setNeedsAuth(true);
      return;
    }

    setIsCreatingSheet(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const created = await createCatalogSpreadsheet(token);
      setSheetInput(created.spreadsheetId);
      setSpreadsheetTitle(created.title);
      setAvailableTabs([created.sheetTab]);
      setSelectedTabTitle(created.sheetTab.title);
      localStorage.setItem(STORAGE_SHEET_URL_KEY, created.spreadsheetId);
      localStorage.setItem(STORAGE_SHEET_TAB_KEY, created.sheetTab.title);
      setSheetRows([]);
      onSyncProducts([], `${created.title} · ${created.sheetTab.title}`, created.spreadsheetId, created.sheetTab.title);
      setSuccessMsg(
        `Planilla "${created.title}" creada en tu Google Sheets. Ya podés subir tu primer Card abajo.`
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'No se pudo crear la planilla en Google Sheets.'
      );
    } finally {
      setIsCreatingSheet(false);
    }
  };

  const handleFile1Change = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    const file1 = files?.[0] || null;
    const file2 = files?.[1] || null;

    if (file1PreviewUrl) {
      URL.revokeObjectURL(file1PreviewUrl);
    }
    if (file1) {
      setNewImage1File(file1);
      setFile1PreviewUrl(URL.createObjectURL(file1));
      setNewImage1Url('');
    } else {
      setNewImage1File(null);
      setFile1PreviewUrl(null);
    }

    // If user selected 2 files at once, populate Imagen 2 automatically as well
    if (file2) {
      if (file2PreviewUrl) {
        URL.revokeObjectURL(file2PreviewUrl);
      }
      setNewImage2File(file2);
      setFile2PreviewUrl(URL.createObjectURL(file2));
      setNewImage2Url('');
    }
  };

  const handleFile2Change = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    if (file2PreviewUrl) {
      URL.revokeObjectURL(file2PreviewUrl);
    }
    if (file) {
      setNewImage2File(file);
      setFile2PreviewUrl(URL.createObjectURL(file));
      setNewImage2Url('');
    } else {
      setNewImage2File(null);
      setFile2PreviewUrl(null);
    }
  };

  const handleClearImage2 = () => {
    setNewImage2Url('');
    setNewImage2File(null);
    if (file2PreviewUrl) {
      URL.revokeObjectURL(file2PreviewUrl);
      setFile2PreviewUrl(null);
    }
    if (file2InputRef.current) {
      file2InputRef.current.value = '';
    }
  };

  const handleRequestAddCard = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const spreadsheetId = extractSpreadsheetId(sheetInput);
    if (!spreadsheetId || !selectedTabTitle) {
      setErrorMsg('Primero conectá o creá una planilla de Google Sheets arriba.');
      return;
    }

    if (!newTitle.trim()) {
      setErrorMsg('Escribí el título o nombre de la ropa.');
      return;
    }

    if (!newDescription.trim()) {
      setErrorMsg('Escribí una descripción para el Card.');
      return;
    }

    const normalizedUrl1 = newImage1Url.trim() ? normalizeSheetImageUrl(newImage1Url) : '';
    if (!newImage1File && !normalizedUrl1) {
      setErrorMsg('Subí al menos 1 foto (Imagen 1) o pegá un enlace válido de imagen.');
      return;
    }

    const normalizedUrl2 = newImage2Url.trim() ? normalizeSheetImageUrl(newImage2Url) : '';
    if (newImage2Url.trim() && !newImage2File && !normalizedUrl2) {
      setErrorMsg('El enlace ingresado para la Imagen 2 no es válido.');
      return;
    }

    setPendingMutation({
      type: 'add',
      title: newTitle.trim(),
      description: newDescription.trim(),
      image1File: newImage1File,
      image1Url: normalizedUrl1,
      image2File: newImage2File,
      image2Url: normalizedUrl2,
    });
  };

  const handleConfirmMutation = async () => {
    if (!pendingMutation) return;
    const token = getAccessToken();
    const spreadsheetId = extractSpreadsheetId(sheetInput);

    if (!token || !spreadsheetId) {
      setPendingMutation(null);
      setErrorMsg('Tu sesión expiró o falta la planilla conectada.');
      return;
    }

    setIsMutating(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      if (pendingMutation.type === 'add') {
        let finalImg1 = pendingMutation.image1Url;
        if (pendingMutation.image1File) {
          finalImg1 = await uploadImageToDrive(pendingMutation.image1File, token);
        }

        let finalImg2 = pendingMutation.image2Url;
        if (pendingMutation.image2File) {
          finalImg2 = await uploadImageToDrive(pendingMutation.image2File, token);
        }

        const images = [finalImg1, finalImg2].filter(Boolean);

        await appendSheetProduct(spreadsheetId, selectedTabTitle, token, {
          images,
          name: pendingMutation.title,
          description: pendingMutation.description,
        });

        setNewTitle('');
        setNewDescription('');
        setNewImage1Url('');
        setNewImage1File(null);
        if (file1PreviewUrl) {
          URL.revokeObjectURL(file1PreviewUrl);
          setFile1PreviewUrl(null);
        }
        if (file1InputRef.current) {
          file1InputRef.current.value = '';
        }
        setNewImage2Url('');
        setNewImage2File(null);
        if (file2PreviewUrl) {
          URL.revokeObjectURL(file2PreviewUrl);
          setFile2PreviewUrl(null);
        }
        if (file2InputRef.current) {
          file2InputRef.current.value = '';
        }

        await loadSheetData(spreadsheetId, selectedTabTitle);
        setSuccessMsg(
          `El Card "${pendingMutation.title}" se guardó en Google Sheets y ya está visible en la web de León.`
        );
      } else if (pendingMutation.type === 'delete') {
        const activeTab = availableTabs.find((t) => t.title === selectedTabTitle);
        if (!activeTab) {
          throw new Error('No se encontró la pestaña activa para eliminar la fila.');
        }

        await deleteSheetProductRow(
          spreadsheetId,
          activeTab.sheetId,
          pendingMutation.item.rowIndex,
          token
        );

        await loadSheetData(spreadsheetId, selectedTabTitle);
        setSuccessMsg(
          `El Card "${pendingMutation.item.name}" fue eliminado de Google Sheets y de la web de León.`
        );
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'No se pudo completar la operación en Google Sheets.'
      );
    } finally {
      setIsMutating(false);
      setPendingMutation(null);
    }
  };

  const activeSpreadsheetId = extractSpreadsheetId(sheetInput);
  const publicStoreUrl = (() => {
    const url = new URL(window.location.origin + '/');
    if (activeSpreadsheetId) {
      url.searchParams.set('sheet', activeSpreadsheetId);
      if (selectedTabTitle) url.searchParams.set('tab', selectedTabTitle);
    }
    return url.toString();
  })();

  const handleCopyPublicUrl = async () => {
    try {
      await navigator.clipboard.writeText(publicStoreUrl);
      setCopiedClientLink(true);
      window.setTimeout(() => setCopiedClientLink(false), 2500);
    } catch {
      setCopiedClientLink(false);
    }
  };

  const previewImg1Src =
    file1PreviewUrl || (newImage1Url.trim() ? normalizeSheetImageUrl(newImage1Url) : '');
  const previewImg2Src =
    file2PreviewUrl || (newImage2Url.trim() ? normalizeSheetImageUrl(newImage2Url) : '');
  const previewImages = [previewImg1Src, previewImg2Src].filter(Boolean);
  const hasImage2 = Boolean(newImage2File || newImage2Url.trim());

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#0B0C0F] text-[#F3F4F6]">
      {/* 3-Zone Top Bar for Admin */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0B0C0F]/92 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 sm:gap-8 px-4 sm:px-6 lg:px-8">
          <span className="font-display text-lg sm:text-xl font-semibold tracking-tight text-white whitespace-nowrap shrink-0">
            León Admin
          </span>

          <nav
            aria-label="Secciones de administrador"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-zinc-400"
          >
            <a
              href="#admin-conexion"
              className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Google Sheets
            </a>
            <a
              href="#admin-subir"
              className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Subir Card
            </a>
            <a
              href="#admin-cards"
              className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Cards activos ({sheetRows.length})
            </a>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onGoToStorefront}
              className="inline-flex items-center gap-1.5 sm:gap-2 rounded-lg bg-white px-3 py-2 sm:px-4 text-xs font-semibold text-zinc-950 transition-colors hover:bg-zinc-200 whitespace-nowrap shrink-0"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Ver web de León</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:py-10 sm:px-6 lg:px-8 space-y-8 sm:space-y-10">
        {/* Intro + Auth Card */}
        <section
          id="admin-conexion"
          className="rounded-2xl border border-white/10 bg-[#13151A] p-5 sm:p-8"
        >
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between border-b border-white/10 pb-6">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-zinc-400">
                Panel Administrador · León Indumentaria
              </p>
              <h1 className="mt-1.5 font-display text-2xl sm:text-3xl font-semibold text-white">
                Administrá tus Cards con Google Sheets
              </h1>
            </div>

            {needsAuth ? (
              <GoogleSignInButton
                onClick={handleLogin}
                disabled={isLoggingIn}
                label={isLoggingIn ? 'Conectando...' : 'Sign in with Google'}
              />
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs text-zinc-300">{user?.email || user?.displayName}</span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-[#0B0C0F] px-3.5 py-2 text-xs font-medium text-zinc-200 hover:border-white/30 hover:text-white transition-colors whitespace-nowrap"
                >
                  <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Cerrar sesión</span>
                </button>
              </div>
            )}
          </div>

          {needsAuth ? (
            <p className="mt-5 text-sm leading-relaxed text-zinc-300 max-w-2xl">
              Iniciá sesión con tu cuenta de Google para conectar o crear la planilla de catálogo.
              Cada prenda que subas desde acá guardará su foto en tu Google Drive y agregará la
              fila en Google Sheets automáticamente.
            </p>
          ) : (
            <div className="mt-6 space-y-5">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 items-end">
                <div className="lg:col-span-6">
                  <label
                    htmlFor="admin-sheet-url"
                    className="block text-xs font-medium text-zinc-400 mb-1.5"
                  >
                    Enlace o ID de tu Google Sheet
                  </label>
                  <input
                    id="admin-sheet-url"
                    type="text"
                    value={sheetInput}
                    onChange={(e) => setSheetInput(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    className="w-full rounded-lg border border-white/15 bg-[#0B0C0F] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:border-white/40 focus:outline-none"
                  />
                </div>

                {availableTabs.length > 0 && (
                  <div className="lg:col-span-2">
                    <label
                      htmlFor="admin-sheet-tab"
                      className="block text-xs font-medium text-zinc-400 mb-1.5"
                    >
                      Pestaña
                    </label>
                    <select
                      id="admin-sheet-tab"
                      value={selectedTabTitle}
                      onChange={(e) => {
                        setSelectedTabTitle(e.target.value);
                        loadSheetData(sheetInput, e.target.value);
                      }}
                      className="w-full rounded-lg border border-white/15 bg-[#0B0C0F] px-3 py-2.5 text-sm text-white focus:border-white/40 focus:outline-none"
                    >
                      {availableTabs.map((tab) => (
                        <option key={tab.sheetId} value={tab.title}>
                          {tab.title}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div
                  className={`${
                    availableTabs.length > 0 ? 'lg:col-span-4' : 'lg:col-span-6'
                  } flex flex-col sm:flex-row gap-2.5`}
                >
                  <button
                    type="button"
                    onClick={() => loadSheetData()}
                    disabled={isSyncing}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-xs font-semibold text-zinc-950 transition-colors hover:bg-zinc-200 disabled:opacity-60 whitespace-nowrap"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`}
                      aria-hidden="true"
                    />
                    <span>{isSyncing ? 'Conectando...' : 'Conectar planilla'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCreateSpreadsheet}
                    disabled={isCreatingSheet}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-white/15 bg-[#0B0C0F] px-4 py-2.5 text-xs font-medium text-zinc-200 transition-colors hover:border-white/30 hover:text-white disabled:opacity-60 whitespace-nowrap"
                  >
                    <FilePlus2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{isCreatingSheet ? 'Creando...' : 'Crear planilla nueva'}</span>
                  </button>
                </div>
              </div>

              {activeSpreadsheetId && spreadsheetTitle && (
                <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-[#0B0C0F] p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2.5 text-xs text-zinc-300">
                    <FileSpreadsheet className="h-4 w-4 text-[#22C55E] shrink-0" aria-hidden="true" />
                    <span>
                      Planilla conectada: <strong className="text-white">{spreadsheetTitle}</strong>{' '}
                      · Pestaña <strong className="text-white">{selectedTabTitle}</strong>
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleCopyPublicUrl}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-[#13151A] px-3.5 py-2 text-xs font-medium text-zinc-200 hover:border-white/30 hover:text-white transition-colors whitespace-nowrap shrink-0"
                  >
                    {copiedClientLink ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-[#22C55E]" aria-hidden="true" />
                        <span>Link de tienda copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Copiar link de la web para clientes</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {errorMsg && (
            <div
              role="alert"
              className="mt-5 flex items-start gap-2 rounded-lg border border-red-400/25 bg-red-950/30 px-4 py-3 text-xs text-red-200"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" aria-hidden="true" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div
              role="status"
              className="mt-5 flex items-start gap-2 rounded-lg border border-emerald-400/25 bg-emerald-950/30 px-4 py-3 text-xs text-emerald-200"
            >
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />
              <span>{successMsg}</span>
            </div>
          )}
        </section>

        {/* Upload New Card Section + Live Preview */}
        {!needsAuth && (
          <section
            id="admin-subir"
            className="grid grid-cols-1 gap-8 lg:grid-cols-12 items-start"
          >
            <form
              onSubmit={handleRequestAddCard}
              className="lg:col-span-8 rounded-2xl border border-white/10 bg-[#13151A] p-6 sm:p-8 space-y-5"
            >
              <div>
                <h2 className="font-display text-2xl font-semibold text-white">
                  Subir nuevo Card a la web de León
                </h2>
                <p className="mt-1 text-xs text-zinc-400">
                  Podés subir 1 o 2 fotos por prenda (se guardan en tu Drive) o pegar enlaces de
                  imagen. Si cargás 2 fotos, tus clientes podrán deslizarlas con la mano en el Card.
                </p>
              </div>

              {/* Imagen 1 (obligatoria) */}
              <div className="rounded-xl border border-white/10 bg-[#0B0C0F]/60 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="block text-xs font-semibold uppercase tracking-[0.12em] text-zinc-200">
                    Imagen 1 (Principal · obligatoria)
                  </span>
                  {previewImg1Src && (
                    <span className="text-[11px] font-medium text-emerald-400">
                      Foto 1 cargada
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="card-photo-file-1"
                      className="block text-xs font-medium text-zinc-400 mb-1.5"
                    >
                      Subir foto 1 (o elegir 2 juntas)
                    </label>
                    <label
                      htmlFor="card-photo-file-1"
                      className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-white/25 bg-[#0B0C0F] px-4 py-3 text-xs font-medium text-zinc-200 transition-colors hover:border-white/45 hover:text-white"
                    >
                      {previewImg1Src ? (
                        <img
                          src={previewImg1Src}
                          alt="Miniatura foto 1"
                          referrerPolicy="no-referrer"
                          className="h-7 w-7 rounded object-cover shrink-0"
                        />
                      ) : (
                        <ImagePlus className="h-4 w-4 shrink-0" aria-hidden="true" />
                      )}
                      <span className="truncate">
                        {newImage1File ? newImage1File.name : 'Elegir 1 o 2 imágenes'}
                      </span>
                      <input
                        ref={file1InputRef}
                        id="card-photo-file-1"
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleFile1Change}
                        className="sr-only"
                      />
                    </label>
                  </div>

                  <div>
                    <label
                      htmlFor="card-photo-url-1"
                      className="block text-xs font-medium text-zinc-400 mb-1.5"
                    >
                      O pegar enlace de imagen 1
                    </label>
                    <input
                      id="card-photo-url-1"
                      type="text"
                      value={newImage1Url}
                      onChange={(e) => {
                        setNewImage1Url(e.target.value);
                        if (e.target.value.trim() && newImage1File) {
                          setNewImage1File(null);
                          if (file1PreviewUrl) {
                            URL.revokeObjectURL(file1PreviewUrl);
                            setFile1PreviewUrl(null);
                          }
                          if (file1InputRef.current) {
                            file1InputRef.current.value = '';
                          }
                        }
                      }}
                      placeholder="https://... o enlace de Drive"
                      className="w-full rounded-lg border border-white/15 bg-[#0B0C0F] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:border-white/40 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Imagen 2 (opcional) */}
              <div className="rounded-xl border border-white/10 bg-[#0B0C0F]/60 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-300">
                      Imagen 2 (Opcional · deslizable con la mano)
                    </span>
                    {previewImg2Src && (
                      <span className="text-[11px] font-medium text-emerald-400">
                        Foto 2 cargada
                      </span>
                    )}
                  </div>
                  {hasImage2 && (
                    <button
                      type="button"
                      onClick={handleClearImage2}
                      className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white transition-colors"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Quitar foto 2</span>
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="card-photo-file-2"
                      className="block text-xs font-medium text-zinc-400 mb-1.5"
                    >
                      Subir foto 2 desde dispositivo
                    </label>
                    <label
                      htmlFor="card-photo-file-2"
                      className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-white/25 bg-[#0B0C0F] px-4 py-3 text-xs font-medium text-zinc-200 transition-colors hover:border-white/45 hover:text-white"
                    >
                      {previewImg2Src ? (
                        <img
                          src={previewImg2Src}
                          alt="Miniatura foto 2"
                          referrerPolicy="no-referrer"
                          className="h-7 w-7 rounded object-cover shrink-0"
                        />
                      ) : (
                        <ImagePlus className="h-4 w-4 shrink-0" aria-hidden="true" />
                      )}
                      <span className="truncate">
                        {newImage2File ? newImage2File.name : 'Elegir imagen 2 (opcional)'}
                      </span>
                      <input
                        ref={file2InputRef}
                        id="card-photo-file-2"
                        type="file"
                        accept="image/*"
                        onChange={handleFile2Change}
                        className="sr-only"
                      />
                    </label>
                  </div>

                  <div>
                    <label
                      htmlFor="card-photo-url-2"
                      className="block text-xs font-medium text-zinc-400 mb-1.5"
                    >
                      O pegar enlace de imagen 2
                    </label>
                    <input
                      id="card-photo-url-2"
                      type="text"
                      value={newImage2Url}
                      onChange={(e) => {
                        setNewImage2Url(e.target.value);
                        if (e.target.value.trim() && newImage2File) {
                          setNewImage2File(null);
                          if (file2PreviewUrl) {
                            URL.revokeObjectURL(file2PreviewUrl);
                            setFile2PreviewUrl(null);
                          }
                          if (file2InputRef.current) {
                            file2InputRef.current.value = '';
                          }
                        }
                      }}
                      placeholder="https://... o enlace de Drive"
                      className="w-full rounded-lg border border-white/15 bg-[#0B0C0F] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:border-white/40 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label
                  htmlFor="card-title"
                  className="block text-xs font-medium text-zinc-300 mb-1.5"
                >
                  Título de la ropa
                </label>
                <input
                  id="card-title"
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Ej. Campera Oversize Negra"
                  className="w-full rounded-lg border border-white/15 bg-[#0B0C0F] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:border-white/40 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="card-description"
                  className="block text-xs font-medium text-zinc-300 mb-1.5"
                >
                  Descripción
                </label>
                <textarea
                  id="card-description"
                  rows={3}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Ej. Frisa pesada algodón peinado, talles S al XL. Ventas por mayor y menor."
                  className="w-full rounded-lg border border-white/15 bg-[#0B0C0F] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:border-white/40 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-lg bg-[#22C55E] px-5 py-2.5 text-xs font-semibold text-zinc-950 transition-colors hover:bg-[#16A34A] whitespace-nowrap"
                >
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  <span>Subir Card a la web</span>
                </button>
              </div>
            </form>

            {/* Live Card Preview */}
            <div className="lg:col-span-4">
              <p className="mb-3 text-xs uppercase tracking-[0.14em] text-zinc-400">
                Vista previa del Card{previewImages.length > 1 ? ' · Deslizá la foto' : ''}
              </p>
              <div className="flex flex-col justify-between rounded-xl border border-white/10 bg-[#13151A] overflow-hidden">
                {previewImages.length > 0 ? (
                  <SwipeableProductGallery
                    images={previewImages}
                    alt={newTitle || 'Vista previa'}
                  />
                ) : (
                  <div className="w-full min-h-[220px] bg-[#181A20] overflow-hidden flex items-center justify-center">
                    <span className="text-xs text-zinc-500 px-6 py-16 text-center">
                      Acá se verán 1 o 2 fotos de tu prenda
                    </span>
                  </div>
                )}
                <div className="p-5 space-y-3">
                  <div>
                    <h3 className="text-base font-semibold text-white">
                      {newTitle.trim() || 'Título de la ropa'}
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-zinc-300">
                      {newDescription.trim() || 'Descripción de la prenda.'}
                    </p>
                  </div>
                  <a
                    href={buildWhatsAppUrl(
                      `Hola León Indumentaria, quiero consultar por "${
                        newTitle.trim() || 'esta prenda'
                      }".`
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#22C55E] px-4 py-2.5 text-xs font-semibold text-zinc-950"
                  >
                    <span>Consultar por WhatsApp ({WHATSAPP_SHORT})</span>
                  </a>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Active Cards List with Delete Option */}
        {!needsAuth && (
          <section id="admin-cards" className="space-y-5">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h2 className="font-display text-2xl font-semibold text-white">
                  Cards publicados en Google Sheets
                </h2>
                <p className="mt-1 text-xs text-zinc-400">
                  Al borrar un Card de acá se elimina la fila de Google Sheets y desaparece
                  automáticamente de la web de León.
                </p>
              </div>
              <span className="text-xs text-zinc-400 tabular-nums">
                {sheetRows.length} prenda{sheetRows.length === 1 ? '' : 's'}
              </span>
            </div>

            {sheetRows.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-[#13151A] p-8 text-center text-sm text-zinc-400">
                {activeSpreadsheetId
                  ? 'Todavía no hay prendas en esta planilla. Usá el formulario de arriba para subir el primer Card.'
                  : 'Conectá o creá una planilla de Google Sheets arriba para administrar tus Cards.'}
              </div>
            ) : (
              <div className="grid grid-cols-1 items-start gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {sheetRows.map((item) => (
                  <article
                    key={`${item.id}-${item.rowIndex}`}
                    className="flex flex-col justify-between rounded-xl border border-white/10 bg-[#13151A] overflow-hidden"
                  >
                    <SwipeableProductGallery images={item.images} alt={item.name} />

                    <div className="flex flex-1 flex-col justify-between gap-4 p-5">
                      <div>
                        <h3 className="text-base font-semibold text-white">{item.name}</h3>
                        <p className="mt-1.5 text-sm leading-relaxed text-zinc-300">
                          {item.description}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setPendingMutation({ type: 'delete', item })}
                        className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-400/30 bg-red-950/30 px-4 py-2.5 text-xs font-semibold text-red-200 transition-colors hover:bg-red-500 hover:text-white whitespace-nowrap"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Borrar Card</span>
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      <ConfirmActionModal
        isOpen={pendingMutation !== null}
        variant={pendingMutation?.type === 'delete' ? 'danger' : 'primary'}
        title={
          pendingMutation?.type === 'delete'
            ? `¿Borrar "${pendingMutation.item.name}"?`
            : pendingMutation?.type === 'add'
            ? `¿Publicar "${pendingMutation.title}" en la web?`
            : ''
        }
        description={
          pendingMutation?.type === 'delete'
            ? `Se eliminará la fila ${pendingMutation.item.rowIndex + 1} de tu planilla "${spreadsheetTitle}" y este Card dejará de mostrarse en la web de León.`
            : pendingMutation?.type === 'add'
            ? `Se agregará una nueva fila en "${spreadsheetTitle}" (${selectedTabTitle})${
                pendingMutation.image1File && pendingMutation.image2File
                  ? ' y se subirán las 2 imágenes a tu Google Drive'
                  : pendingMutation.image1File || pendingMutation.image2File
                  ? ' y se subirá la imagen a tu Google Drive'
                  : ''
              }.`
            : ''
        }
        confirmLabel={
          pendingMutation?.type === 'delete' ? 'Sí, borrar Card' : 'Sí, publicar Card'
        }
        isBusy={isMutating}
        onConfirm={handleConfirmMutation}
        onCancel={() => setPendingMutation(null)}
      />
    </div>
  );
}
