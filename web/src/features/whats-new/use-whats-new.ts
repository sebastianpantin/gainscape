import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { type Release, whatsNewDecision, whatsNewMayOpen } from '../../lib/changelog-rules.ts';
import { openChannel } from '../../lib/channel.ts';
import { readLastSeenRelease, saveLastSeenRelease } from '../../lib/last-seen-release-store.ts';
import { deviceStorage } from '../../lib/rest-timer-store.ts';
import { openDraftStoreAndReconcile } from '../../offline/draft-boot.ts';
import { DRAFT_CHANNEL_NAME } from '../../offline/draft-session.ts';
import { hasDraftOnDevice } from '../../offline/local-drafts.ts';
import { APP_VERSION, CHANGELOG } from './changelog-data.ts';

async function draftOnDevice(userId: string): Promise<boolean> {
  try {
    return await hasDraftOnDevice(await openDraftStoreAndReconcile(), deviceStorage(), userId);
  } catch {
    return true;
  }
}

export function useWhatsNew(userId: string): { releases: readonly Release[] | null; dismiss: () => void } {
  const { pathname } = useLocation();
  const [decision] = useState(() => whatsNewDecision(CHANGELOG, readLastSeenRelease(deviceStorage(), userId)));
  const [draftChanges, setDraftChanges] = useState(0);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const pending = decision.kind === 'show' && !dismissed;

  useEffect(() => {
    if (decision.kind === 'record') saveLastSeenRelease(deviceStorage(), userId, decision.version);
  }, [decision, userId]);

  useEffect(() => {
    if (!pending) return;
    const channel = openChannel(DRAFT_CHANNEL_NAME);
    if (!channel) return;
    channel.onmessage = (event: MessageEvent<{ userId?: unknown }>) => {
      if (event.data?.userId === userId) setDraftChanges((count) => count + 1);
    };
    return () => channel.close();
  }, [pending, userId]);

  useEffect(() => {
    if (!pending || open) return;
    let superseded = false;
    void (async () => {
      const hasDraft = await draftOnDevice(userId);
      if (superseded || !whatsNewMayOpen({ pathname, hasDraft })) return;
      const draftAppeared = await draftOnDevice(userId);
      if (!superseded && !draftAppeared) setOpen(true);
    })();
    return () => {
      superseded = true;
    };
  }, [pending, open, pathname, draftChanges, userId]);

  const dismiss = useCallback(() => {
    saveLastSeenRelease(deviceStorage(), userId, APP_VERSION);
    setDismissed(true);
    setOpen(false);
  }, [userId]);

  return { releases: open && decision.kind === 'show' ? decision.releases : null, dismiss };
}
