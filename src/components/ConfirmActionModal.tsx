import { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmActionModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  variant?: 'danger' | 'primary';
  isBusy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmActionModal({
  isOpen,
  title,
  description,
  confirmLabel,
  variant = 'primary',
  isBusy = false,
  onConfirm,
  onCancel,
}: ConfirmActionModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isBusy) {
        onCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, isBusy, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      onClick={() => {
        if (!isBusy) onCancel();
      }}
    >
      <div
        className="w-full max-w-md rounded-xl border border-white/15 bg-[#13151A] p-6 text-zinc-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle
              className={`mt-0.5 h-5 w-5 shrink-0 ${
                variant === 'danger' ? 'text-red-400' : 'text-zinc-200'
              }`}
              aria-hidden="true"
            />
            <div>
              <h3 id="confirm-modal-title" className="text-base font-semibold text-white">
                {title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-300">{description}</p>
            </div>
          </div>

          <button
            type="button"
            disabled={isBusy}
            onClick={onCancel}
            aria-label="Cancelar operación"
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3 border-t border-white/10 pt-4">
          <button
            type="button"
            disabled={isBusy}
            onClick={onCancel}
            className="rounded-lg border border-white/15 bg-[#0B0C0F] px-4 py-2 text-xs font-medium text-zinc-200 transition-colors hover:border-white/30 hover:text-white disabled:opacity-50 whitespace-nowrap"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-60 whitespace-nowrap ${
              variant === 'danger'
                ? 'bg-red-500 text-white hover:bg-red-600'
                : 'bg-[#22C55E] text-zinc-950 hover:bg-[#16A34A]'
            }`}
          >
            {isBusy ? 'Procesando...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
