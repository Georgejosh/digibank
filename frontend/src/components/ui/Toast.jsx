import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/utils/cn';

const VARIANTS = {
  success: { icon: CheckCircle2, ring: 'ring-success-100', iconColor: 'text-success-600' },
  error: { icon: AlertCircle, ring: 'ring-danger-100', iconColor: 'text-danger-600' },
  info: { icon: Info, ring: 'ring-brand-200', iconColor: 'text-brand-700' },
};

/**
 * Rendered once by ToastProvider. Screens never mount this directly - they
 * call useToast().
 */
export function ToastViewport({ toasts, onDismiss }) {
  if (!toasts.length) return null;

  return (
    <div
      // polite, not assertive: a deposit confirmation should not interrupt a
      // screen reader mid-sentence.
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-4 sm:items-end"
    >
      {toasts.map((toast) => {
        const { icon: Icon, ring, iconColor } = VARIANTS[toast.variant] ?? VARIANTS.info;
        return (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto flex w-full max-w-sm animate-toast-in items-start gap-3',
              'rounded-card bg-white p-4 shadow-card-hover ring-1',
              ring
            )}
          >
            <Icon aria-hidden="true" className={cn('mt-0.5 h-5 w-5 shrink-0', iconColor)} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink-900">{toast.title}</p>
              {toast.description && (
                <p className="mt-0.5 text-sm text-ink-600">{toast.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              className="-m-1 rounded p-1 text-ink-400 transition-colors hover:bg-ink-50 hover:text-ink-700"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default ToastViewport;
