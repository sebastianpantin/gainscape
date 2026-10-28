import { useEffect, useRef } from 'react';

export function useModalDialog() {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement;
    if (element && !element.open) element.showModal();
    return () => {
      element?.close();
      const focusLost = document.activeElement === document.body || element?.contains(document.activeElement);
      if (focusLost && opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  return dialog;
}
