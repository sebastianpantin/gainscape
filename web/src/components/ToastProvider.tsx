import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type ToastAction, ToastContext } from '../lib/ui/toast.ts';
import { addToast, type ShownToast, toastDurationMs } from '../lib/ui/toast-rules.ts';
import { useLastInputWasKeyboard } from '../lib/ui/use-last-input-was-keyboard.ts';

interface ToastItemProps {
  toast: ShownToast;
  onClose: (id: number) => void;
}

function ToastItem({ toast, onClose }: ToastItemProps) {
  const [held, setHeld] = useState(false);
  const { id, text, action, raisedFromKeyboard } = toast;
  const duration = toastDurationMs(text, action !== null, raisedFromKeyboard);

  useEffect(() => {
    if (held || duration === null) return;
    const hide = setTimeout(() => onClose(id), duration);
    return () => clearTimeout(hide);
  }, [id, duration, held, onClose]);

  return (
    <p
      className={action ? 'toast with-action' : 'toast'}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
    >
      {text}
      {action && (
        <button
          className="button link"
          type="button"
          onClick={() => {
            action.onAct();
            onClose(id);
          }}
        >
          {action.label}
        </button>
      )}
      {duration === null && (
        <button className="button link" type="button" onClick={() => onClose(id)}>
          Dismiss
        </button>
      )}
    </p>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState<ShownToast[]>([]);
  const lastId = useRef(0);
  const lastInputWasKeyboard = useLastInputWasKeyboard();

  const showToast = useCallback(
    (text: string, action?: ToastAction) => {
      lastId.current += 1;
      const next = {
        id: lastId.current,
        text,
        action: action ?? null,
        raisedFromKeyboard: lastInputWasKeyboard.current,
      };
      setShown((current) => addToast(current, next));
    },
    [lastInputWasKeyboard],
  );
  const dismissToast = useCallback(() => setShown([]), []);
  const closeToast = useCallback((id: number) => setShown((current) => current.filter((toast) => toast.id !== id)), []);
  const toasts = useMemo(() => ({ showToast, dismissToast }), [showToast, dismissToast]);

  return (
    <ToastContext.Provider value={toasts}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {shown.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onClose={closeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
