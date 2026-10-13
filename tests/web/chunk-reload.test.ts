import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CHUNK_RELOAD_COOLDOWN_MS,
  CHUNK_RELOAD_KEY,
  claimChunkReload,
  reloadOnChunkLoadError,
} from '../../web/src/pwa/chunk-reload.ts';
import { MemoryStorage } from './memory-storage.ts';

const NOW = 1_700_000_000_000;

function blocked(): never {
  throw new Error('blocked');
}

describe('claimChunkReload', () => {
  it('reloads on the first chunk failure and remembers when', () => {
    const storage = new MemoryStorage();
    expect(claimChunkReload(storage, NOW)).toBe(true);
    expect(storage.getItem(CHUNK_RELOAD_KEY)).toBe(String(NOW));
  });

  it('does not reload again while the last reload is recent, so a broken chunk cannot loop', () => {
    const storage = new MemoryStorage();
    claimChunkReload(storage, NOW);
    expect(claimChunkReload(storage, NOW + CHUNK_RELOAD_COOLDOWN_MS - 1)).toBe(false);
  });

  it('reloads again once the cooldown has passed, for a later deploy in the same tab', () => {
    const storage = new MemoryStorage();
    claimChunkReload(storage, NOW);
    expect(claimChunkReload(storage, NOW + CHUNK_RELOAD_COOLDOWN_MS)).toBe(true);
  });

  it('treats an unreadable stored time as no earlier reload', () => {
    const storage = new MemoryStorage();
    storage.setItem(CHUNK_RELOAD_KEY, 'not a time');
    expect(claimChunkReload(storage, NOW)).toBe(true);
  });

  it('never reloads when the guard cannot be stored', () => {
    const readOnly = new MemoryStorage();
    readOnly.setItem = blocked;
    const unreadable = new MemoryStorage();
    unreadable.getItem = blocked;
    expect(claimChunkReload(null, NOW)).toBe(false);
    expect(claimChunkReload(readOnly, NOW)).toBe(false);
    expect(claimChunkReload(unreadable, NOW)).toBe(false);
  });
});

describe('reloadOnChunkLoadError', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubPage() {
    const page = new EventTarget();
    const reload = vi.fn();
    vi.stubGlobal('window', Object.assign(page, { location: { reload } }));
    vi.stubGlobal('sessionStorage', new MemoryStorage());
    return { page, reload };
  }

  it('reloads only after the open drafts are flushed, so a pending draft write is not lost', async () => {
    const { page, reload } = stubPage();
    let finishFlush: () => void = () => undefined;
    const flushDrafts = vi.fn(() => new Promise<void>((resolve) => (finishFlush = resolve)));
    reloadOnChunkLoadError(flushDrafts);
    const preloadError = new Event('vite:preloadError', { cancelable: true });
    page.dispatchEvent(preloadError);
    expect(preloadError.defaultPrevented).toBe(true);
    expect(flushDrafts).toHaveBeenCalledOnce();
    await Promise.resolve();
    expect(reload).not.toHaveBeenCalled();
    finishFlush();
    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
  });

  it('still reloads when flushing the drafts fails', async () => {
    const { page, reload } = stubPage();
    reloadOnChunkLoadError(() => Promise.reject(new Error('store closed')));
    page.dispatchEvent(new Event('vite:preloadError', { cancelable: true }));
    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
  });
});
