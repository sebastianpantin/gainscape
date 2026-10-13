import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ToastContext } from '../lib/toast.ts';
import { toastDurationMs } from '../lib/toast-rules.ts';

interface ShownToast {
  id: number;
  text: string;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ShownToast | null>(null);
  const lastId = useRef(0);

  const showToast = useCallback((text: string) => {
    lastId.current += 1;
    setToast({ id: lastId.current, text });
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);
  const toasts = useMemo(() => ({ showToast, dismissToast }), [showToast, dismissToast]);

  useEffect(() => {
    if (toast === null) return;
    const hide = setTimeout(() => setToast(null), toastDurationMs(toast.text));
    return () => clearTimeout(hide);
  }, [toast]);

  return (
    <ToastContext.Provider value={toasts}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {toast && (
          <p key={toast.id} className="toast">
            {toast.text}
          </p>
        )}
      </div>
    </ToastContext.Provider>
  );
}
