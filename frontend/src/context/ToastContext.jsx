import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { ToastViewport } from '@/components/ui/Toast';

/**
 * App-wide toasts. Mutations call `toast.success(...)` / `toast.error(...)`
 * instead of each screen inventing its own banner.
 */
const ToastContext = createContext(null);

const DEFAULT_DURATION = 4000;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (toast) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((current) => [...current, { id, variant: 'info', ...toast }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), toast.duration ?? DEFAULT_DURATION)
      );
      return id;
    },
    [dismiss]
  );

  const value = useMemo(
    () => ({
      push,
      dismiss,
      success: (title, description) => push({ variant: 'success', title, description }),
      error: (title, description) => push({ variant: 'error', title, description }),
      info: (title, description) => push({ variant: 'info', title, description }),
    }),
    [push, dismiss]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used inside <ToastProvider>');
  }
  return context;
}
