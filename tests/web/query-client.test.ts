import { onlineManager } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../../web/src/lib/query/query-client.ts';

const KEY = ['probe'];

describe('createQueryClient', () => {
  afterEach(() => onlineManager.setOnline(true));

  it('fails a load after a single attempt so the screen shows its problem at once', async () => {
    const load = vi.fn(() => Promise.reject(new Error('server down')));
    await expect(createQueryClient().fetchQuery({ queryKey: KEY, queryFn: load })).rejects.toThrow('server down');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('still runs a load while the browser reports offline instead of pausing on the skeleton', async () => {
    onlineManager.setOnline(false);
    const load = vi.fn(() => Promise.resolve('saved copy'));
    await expect(createQueryClient().fetchQuery({ queryKey: KEY, queryFn: load })).resolves.toBe('saved copy');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('serves live data from the cache within the fresh window so a tab switch does not refetch', async () => {
    const client = createQueryClient();
    const load = vi.fn(() => Promise.resolve({ loaded: 'levels', fromCache: false }));
    await client.fetchQuery({ queryKey: KEY, queryFn: load });
    await client.fetchQuery({ queryKey: KEY, queryFn: load });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('refetches once a change invalidates the data, so a finished workout shows up at once', async () => {
    const client = createQueryClient();
    const load = vi.fn(() => Promise.resolve({ loaded: 'levels', fromCache: false }));
    await client.fetchQuery({ queryKey: KEY, queryFn: load });
    await client.invalidateQueries({ queryKey: KEY });
    await client.fetchQuery({ queryKey: KEY, queryFn: load });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('refetches a saved copy on the next visit', async () => {
    const client = createQueryClient();
    const load = vi.fn(() => Promise.resolve({ loaded: 'levels', fromCache: true, offline: true }));
    await client.fetchQuery({ queryKey: KEY, queryFn: load });
    await client.fetchQuery({ queryKey: KEY, queryFn: load });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('refetches the friends feed on every visit, since other people change it', async () => {
    const client = createQueryClient();
    const load = vi.fn(() => Promise.resolve([]));
    await client.fetchQuery({ queryKey: ['feed', 'user'], queryFn: load });
    await client.fetchQuery({ queryKey: ['feed', 'user'], queryFn: load });
    expect(load).toHaveBeenCalledTimes(2);
  });
});
