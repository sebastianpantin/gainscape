import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  type Release,
  type WhatsNewDecision,
  whatsNewDecision,
  whatsNewMayOpen,
} from '../../lib/platform/changelog-rules.ts';
import { openChannel } from '../../lib/platform/channel.ts';
import { readLastSeenRelease, saveLastSeenRelease } from '../../lib/platform/last-seen-release-store.ts';
import { readOnboarding } from '../../lib/profile/onboarding-store.ts';
import { deviceStorage } from '../../lib/platform/keyed-store.ts';
import { hasUnsyncedDraftHere } from '../../offline/draft-boot.ts';
import { DRAFT_CHANNEL_NAME } from '../../offline/draft-session.ts';

export function useWhatsNew(userId: string): { releases: readonly Release[] | null; dismiss: () => void } {
  const { pathname, key: visitKey } = useLocation();
  const currentVisit = useRef(visitKey);
  const [loaded, setLoaded] = useState<{ decision: WhatsNewDecision; appVersion: string } | null>(null);
  const decision = loaded?.decision ?? { kind: 'none' };
  const [draftChange, setDraftChange] = useState({ count: 0, visitKey: '' });
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const pending = decision.kind === 'show' && !dismissed;

  useEffect(() => {
    currentVisit.current = visitKey;
  }, [visitKey]);

  useEffect(() => {
    let superseded = false;
    import('./changelog-data.ts')
      .then(({ APP_VERSION, CHANGELOG }) => {
        if (superseded) return;
        const loadedDecision = whatsNewDecision(CHANGELOG, readLastSeenRelease(deviceStorage(), userId));
        if (loadedDecision.kind === 'record') saveLastSeenRelease(deviceStorage(), userId, loadedDecision.version);
        setLoaded({ decision: loadedDecision, appVersion: APP_VERSION });
      })
      .catch(() => undefined);
    return () => {
      superseded = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!pending) return;
    const channel = openChannel(DRAFT_CHANNEL_NAME);
    if (!channel) return;
    channel.onmessage = (event: MessageEvent<{ userId?: unknown }>) => {
      if (event.data?.userId === userId)
        setDraftChange((change) => ({ count: change.count + 1, visitKey: currentVisit.current }));
    };
    return () => channel.close();
  }, [pending, userId]);

  useEffect(() => {
    if (!pending || open) return;
    let superseded = false;
    void (async () => {
      const hasDraft = await hasUnsyncedDraftHere(userId).catch(() => true);
      const draftChangedDuringVisit = draftChange.visitKey === visitKey;
      const introPending = readOnboarding(deviceStorage(), userId).status === 'absent';
      if (superseded || !whatsNewMayOpen({ pathname, hasDraft, draftChangedDuringVisit, introPending })) return;
      const draftAppeared = await hasUnsyncedDraftHere(userId).catch(() => true);
      if (!superseded && !draftAppeared) setOpen(true);
    })();
    return () => {
      superseded = true;
    };
  }, [pending, open, pathname, visitKey, draftChange, userId]);

  const dismiss = () => {
    if (loaded) saveLastSeenRelease(deviceStorage(), userId, loaded.appVersion);
    setDismissed(true);
    setOpen(false);
  };

  return { releases: open && decision.kind === 'show' ? decision.releases : null, dismiss };
}
