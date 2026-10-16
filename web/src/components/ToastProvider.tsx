import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type ToastAction, ToastContext } from '../lib/ui/toast.ts';
import { toastDurationMs } from '../lib/ui/toast-rules.ts';

interface ShownToast {
  id: number;
  text: string;
  action: ToastAction | null;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ShownToast | null>(null);
  const lastId = useRef(0);

  const showToast = useCallback((text: string, action?: ToastAction) => {
    lastId.current += 1;
    setToast({ id: lastId.current, text, action: action ?? null });
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
          <p key={toast.id} className={toast.action ? 'toast with-action' : 'toast'}>
            {toast.text}
            {toast.action && (
              <button
                className="button link"
                type="button"
                onClick={() => {
                  toast.action?.onAct();
                  setToast(null);
                }}
              >
                {toast.action.label}
              </button>
            )}
          </p>
        )}
      </div>
    </ToastContext.Provider>
  );
}
