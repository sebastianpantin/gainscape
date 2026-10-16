import { useEffect, useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx';
import { deviceStorage } from '../../lib/platform/keyed-store.ts';
import type { DraftStore } from '../../offline/draft-store.ts';
import { forgetOtherAccountDrafts, otherAccountDraftIds } from '../../offline/local-drafts.ts';

interface OtherAccountDraftNoticeProps {
  store: DraftStore;
  userId: string;
}

export function OtherAccountDraftNotice({ store, userId }: OtherAccountDraftNoticeProps) {
  const [present, setPresent] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let active = true;
    otherAccountDraftIds(store, deviceStorage(), userId).then(
      (userIds) => active && setPresent(userIds.length > 0),
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [store, userId]);

  if (!present) return null;

  const discard = async () => {
    setConfirming(false);
    await forgetOtherAccountDrafts(store, deviceStorage(), userId);
    setPresent((await otherAccountDraftIds(store, deviceStorage(), userId)).length > 0);
  };

  return (
    <>
      <div className="panel stack" role="status">
        <p>An unsynced workout from another account is saved on this device.</p>
        <button className="button danger" type="button" onClick={() => setConfirming(true)}>
          Discard it
        </button>
      </div>
      {confirming && (
        <ConfirmDialog
          title="Discard the other account's workout?"
          confirmLabel="Discard it"
          cancelLabel="Keep it"
          danger
          onConfirm={() => void discard()}
          onCancel={() => setConfirming(false)}
        >
          <p>This cannot be undone.</p>
        </ConfirmDialog>
      )}
    </>
  );
}
