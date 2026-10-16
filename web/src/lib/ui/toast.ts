import { createContext, useContext } from 'react';

export interface ToastAction {
  label: string;
  onAct: () => void;
}

export interface Toasts {
  showToast: (text: string, action?: ToastAction) => void;
  dismissToast: () => void;
}

export const ToastContext = createContext<Toasts>({ showToast: () => undefined, dismissToast: () => undefined });

export function useToast(): Toasts {
  return useContext(ToastContext);
}
