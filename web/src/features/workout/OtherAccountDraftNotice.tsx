import { useEffect, useState } from 'react';
import type { DraftStore } from '../../offline/draft-store.ts';

interface OtherAccountDraftNoticeProps {
  store: DraftStore;
  userId: string;
}

async function otherAccountIds(store: DraftStore, userId: string): Promise<string[]> {
  return (await store.userIdsWithDrafts()).filter((draftUserId) => draftUserId !== userId);
}

async function forgetOtherAccountDrafts(store: DraftStore, userId: string): Promise<void> {
  for (const otherUserId of await otherAccountIds(store, userId)) await store.forget(otherUserId);
}

export function OtherAccountDraftNotice({ store, userId }: OtherAccountDraftNoticeProps) {
  const [present, setPresent] = useState(false);

  useEffect(() => {
    let active = true;
    otherAccountIds(store, userId).then(
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
    await forgetOtherAccountDrafts(store, userId);
    setPresent((await otherAccountIds(store, userId)).length > 0);
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
