'use client';

import { useStore } from '@/lib/store';

const STYLES: Record<string, string> = {
  info: 'border-accent/40 bg-surface-2',
  success: 'border-success/50 bg-surface-2',
  warning: 'border-warning/50 bg-surface-2',
  error: 'border-danger/50 bg-surface-2',
};

const ICONS: Record<string, string> = {
  info: 'ℹ',
  success: '✓',
  warning: '⚠',
  error: '✕',
};

export function Toasts() {
  const toasts = useStore((state) => state.toasts);
  const dismiss = useStore((state) => state.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`animate-in-up pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg ${STYLES[toast.kind]}`}
        >
          <span aria-hidden className="math-symbols mt-0.5 text-base leading-none">
            {ICONS[toast.kind]}
          </span>
          <p className="flex-1 break-words">{toast.message}</p>
          <button
            type="button"
            onClick={() => dismiss(toast.id)}
            className="text-muted transition hover:text-text"
            aria-label="Cerrar aviso"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

export default Toasts;
