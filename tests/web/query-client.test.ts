import { onlineManager } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../../web/src/lib/query-client.ts';

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

  it('refreshes loaded data on the next visit so a finished workout shows up on every tab', async () => {
    const client = createQueryClient();
    const load = vi.fn(() => Promise.resolve('levels'));
    await client.fetchQuery({ queryKey: KEY, queryFn: load });
    await client.fetchQuery({ queryKey: KEY, queryFn: load });
    expect(load).toHaveBeenCalledTimes(2);
  });
});
