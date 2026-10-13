import { useEffect, useRef } from 'react';

interface PendingFocus {
  setId: string | null;
  addKey: string;
}

export function useFocusAfterRemoval(changeSignal: unknown) {
  const focusTargets = useRef(new Map<string, HTMLButtonElement>());
  const focusAfterRemoval = useRef<PendingFocus | null>(null);

  useEffect(() => {
    const pending = focusAfterRemoval.current;
    if (pending === null) return;
    focusAfterRemoval.current = null;
    const nextRow = pending.setId === null ? undefined : focusTargets.current.get(pending.setId);
    (nextRow ?? focusTargets.current.get(pending.addKey))?.focus();
  }, [changeSignal]);

  const focusTarget = (key: string) => (button: HTMLButtonElement | null) => {
    if (button) focusTargets.current.set(key, button);
    else focusTargets.current.delete(key);
  };
  const focusAfterNextChange = (pending: PendingFocus) => {
    focusAfterRemoval.current = pending;
  };

  return { focusTarget, focusAfterNextChange };
}
