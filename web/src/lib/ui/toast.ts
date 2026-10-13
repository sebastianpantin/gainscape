import { createContext, useContext } from 'react';

export interface Toasts {
  showToast: (text: string) => void;
  dismissToast: () => void;
}

export const ToastContext = createContext<Toasts>({ showToast: () => undefined, dismissToast: () => undefined });

export function useToast(): Toasts {
  return useContext(ToastContext);
}
