import { useEffect, useId, useRef } from 'react';
import type { Release } from '../../lib/platform/changelog-rules.ts';
import { ReleaseList } from './ReleaseList.tsx';
import { useWhatsNew } from './use-whats-new.ts';

function WhatsNewDialog({ releases, onDismiss }: { releases: readonly Release[]; onDismiss: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const dismissed = useRef(false);

  function dismissOnce() {
    if (dismissed.current) return;
    dismissed.current = true;
    onDismiss();
  }

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    return () => element?.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="panel stack whats-new-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        dismissOnce();
      }}
      onClose={() => {
        if (!dialog.current?.open) dismissOnce();
      }}
    >
      <h2 id={titleId}>What's new</h2>
      <div className="whats-new-scroll" role="region" aria-label="Release notes" tabIndex={0}>
        <ReleaseList releases={releases} headingLevel={3} />
      </div>
      <button className="button primary" type="button" onClick={dismissOnce}>
        Got it
      </button>
    </dialog>
  );
}

export function WhatsNewSheet({ userId }: { userId: string }) {
  const { releases, dismiss } = useWhatsNew(userId);
  return releases ? <WhatsNewDialog releases={releases} onDismiss={dismiss} /> : null;
}
