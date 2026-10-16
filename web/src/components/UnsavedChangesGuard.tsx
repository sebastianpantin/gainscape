import { type ReactNode, useCallback, useEffect, useRef } from 'react';
import { useBlocker } from 'react-router-dom';
import { ConfirmDialog } from './ConfirmDialog.tsx';

interface UnsavedChangesGuard {
  prompt: ReactNode;
  allowLeaving: () => void;
}

export function useUnsavedChangesGuard(
  dirty: boolean,
  explanation = 'Your changes are not saved.',
): UnsavedChangesGuard {
  const leaving = useRef(false);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !leaving.current && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (!dirty) return;
    const askBeforeUnload = (event: BeforeUnloadEvent) => {
      if (leaving.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', askBeforeUnload);
    return () => window.removeEventListener('beforeunload', askBeforeUnload);
  }, [dirty]);
  const prompt =
    blocker.state === 'blocked' ? (
      <ConfirmDialog
        title="Discard changes?"
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        danger
        onConfirm={() => blocker.proceed()}
        onCancel={() => blocker.reset()}
      >
        <p>{explanation}</p>
      </ConfirmDialog>
    ) : null;
  const allowLeaving = useCallback(() => {
    leaving.current = true;
  }, []);
  return { prompt, allowLeaving };
}
