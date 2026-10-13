import { tabStorage } from '../lib/keyed-store.ts';
import { flushOpenDraftSessions } from '../offline/draft-session.ts';

export const CHUNK_RELOAD_KEY = 'gainscape.chunk-reload-at';
export const CHUNK_RELOAD_COOLDOWN_MS = 10_000;

export function claimChunkReload(storage: Storage | null, now: number): boolean {
  if (!storage) return false;
  try {
    const lastReloadAt = storage.getItem(CHUNK_RELOAD_KEY);
    if (lastReloadAt !== null && now - Number(lastReloadAt) < CHUNK_RELOAD_COOLDOWN_MS) return false;
    storage.setItem(CHUNK_RELOAD_KEY, String(now));
    return true;
  } catch {
    return false;
  }
}

export function reloadOnChunkLoadError(flushDrafts: () => Promise<void> = flushOpenDraftSessions): void {
  window.addEventListener('vite:preloadError', (event) => {
    if (!claimChunkReload(tabStorage(), Date.now())) return;
    event.preventDefault();
    void flushDrafts()
      .catch(() => undefined)
      .finally(() => window.location.reload());
  });
}
