import { useEffect, useState } from 'react';
import { deviceStorage } from '../../lib/rest-timer-store.ts';
import type { DraftStore } from '../../offline/draft-store.ts';
import { forgetOtherAccountDrafts, otherAccountDraftIds } from '../../offline/local-drafts.ts';

interface OtherAccountDraftNoticeProps {
  store: DraftStore;
  userId: string;
}

export function OtherAccountDraftNotice({ store, userId }: OtherAccountDraftNoticeProps) {
  const [present, setPresent] = useState(false);

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
    if (!window.confirm('Discard the unsynced workout from another account? This cannot be undone.')) return;
    await forgetOtherAccountDrafts(store, deviceStorage(), userId);
    setPresent((await otherAccountDraftIds(store, deviceStorage(), userId)).length > 0);
  };

  return (
    <div className="panel stack" role="status">
      <p>An unsynced workout from another account is saved on this device.</p>
      <button className="button danger" type="button" onClick={discard}>
        Discard it
      </button>
    </div>
  );
}
