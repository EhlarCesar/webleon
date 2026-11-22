import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
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

interface AdminPageProps {
  onSyncProducts: (products: ClothingProduct[], sourceLabel: string, spreadsheetId: string, tabTitle: string) => void;
  onGoToStorefront: () => void;
}

const STORAGE_SHEET_URL_KEY = 'leon_sheet_url';
const STORAGE_SHEET_TAB_KEY = 'leon_sheet_tab';

type PendingMutation =
  | { type: 'add'; title: string; description: string; imageFile: File | null; imageUrl: string }
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

  // New card form state
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newImageUrl, setNewImageUrl] = useState('');
  const [newImageFile, setNewImageFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);

  // Explicit confirmation modal state (mandatory before any Workspace mutation)
  const [pendingMutation, setPendingMutation] = useState<PendingMutation>(null);
  const [isMutating, setIsMutating] = useState(false);

  useEffect(() => {
    const unsubscribe = initAuth(
      (authedUser) => {
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
      if (filePreviewUrl) {
        URL.revokeObjectURL(filePreviewUrl);
      }
    };
  }, [filePreviewUrl]);

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
          rows.map(({ id, name, image, description }) => ({ id, name, image, description })),
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
      setUser(result.user);
      setNeedsAuth(false);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'No se pudo iniciar sesión con Google.'
      );
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

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl);
    }
    if (file) {
      setNewImageFile(file);
      setFilePreviewUrl(URL.createObjectURL(file));
      setNewImageUrl('');
    } else {
      setNewImageFile(null);
      setFilePreviewUrl(null);
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

    const normalizedUrl = newImageUrl.trim() ? normalizeSheetImageUrl(newImageUrl) : '';
    if (!newImageFile && !normalizedUrl) {
      setErrorMsg('Subí una foto de la prenda o pegá un enlace válido de imagen.');
      return;
    }

    setPendingMutation({
      type: 'add',
      title: newTitle.trim(),
      description: newDescription.trim(),
      imageFile: newImageFile,
      imageUrl: normalizedUrl,
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
        let finalImageUrl = pendingMutation.imageUrl;
        if (pendingMutation.imageFile) {
          finalImageUrl = await uploadImageToDrive(pendingMutation.imageFile, token);
        }

        await appendSheetProduct(spreadsheetId, selectedTabTitle, token, {
          image: finalImageUrl,
          name: pendingMutation.title,
          description: pendingMutation.description,
        });

        setNewTitle('');
        setNewDescription('');
        setNewImageUrl('');
        setNewImageFile(null);
        if (filePreviewUrl) {
          URL.revokeObjectURL(filePreviewUrl);
          setFilePreviewUrl(null);
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

  const previewImgSrc =
    filePreviewUrl || (newImageUrl.trim() ? normalizeSheetImageUrl(newImageUrl) : '');

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
                  Subí la foto desde tu celular o PC (se guarda en tu Drive) o pegá un link de
                  imagen, escribí el título y la descripción.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="card-photo-file"
                    className="block text-xs font-medium text-zinc-300 mb-1.5"
                  >
                    Subir foto de la prenda
                  </label>
                  <label
                    htmlFor="card-photo-file"
                    className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-white/25 bg-[#0B0C0F] px-4 py-3 text-xs font-medium text-zinc-200 transition-colors hover:border-white/45 hover:text-white"
                  >
                    <ImagePlus className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">
                      {newImageFile ? newImageFile.name : 'Elegir imagen desde dispositivo'}
                    </span>
                    <input
                      id="card-photo-file"
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="sr-only"
                    />
                  </label>
                </div>

                <div>
                  <label
                    htmlFor="card-photo-url"
                    className="block text-xs font-medium text-zinc-300 mb-1.5"
                  >
                    O pegar enlace de imagen
                  </label>
                  <input
                    id="card-photo-url"
                    type="text"
                    value={newImageUrl}
                    onChange={(e) => {
                      setNewImageUrl(e.target.value);
                      if (e.target.value.trim() && newImageFile) {
                        setNewImageFile(null);
                        if (filePreviewUrl) {
                          URL.revokeObjectURL(filePreviewUrl);
                          setFilePreviewUrl(null);
                        }
                      }
                    }}
                    placeholder="https://... o enlace de Drive"
                    className="w-full rounded-lg border border-white/15 bg-[#0B0C0F] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:border-white/40 focus:outline-none"
                  />
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
                Vista previa del Card
              </p>
              <div className="flex flex-col justify-between rounded-xl border border-white/10 bg-[#13151A] overflow-hidden">
                <div className="w-full min-h-[220px] bg-[#181A20] overflow-hidden flex items-center justify-center">
                  {previewImgSrc ? (
                    <img
                      src={previewImgSrc}
                      alt={newTitle || 'Vista previa'}
                      referrerPolicy="no-referrer"
                      className="w-full h-auto max-h-[460px] object-contain"
                    />
                  ) : (
                    <span className="text-xs text-zinc-500 px-6 py-16 text-center">
                      Acá se verá la imagen de tu prenda
                    </span>
                  )}
                </div>
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
                    <div className="w-full bg-[#181A20] overflow-hidden flex items-center justify-center">
                      {item.image ? (
                        <img
                          src={item.image}
                          alt={item.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-auto max-h-[460px] object-contain"
                        />
                      ) : (
                        <div className="flex aspect-[3/4] w-full items-center justify-center p-4 text-xs text-zinc-500">
                          Sin imagen
                        </div>
                      )}
                    </div>

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
                pendingMutation.imageFile ? ' y se subirá la imagen a tu Google Drive' : ''
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
