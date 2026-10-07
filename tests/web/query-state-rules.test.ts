import { describe, expect, it } from 'vitest';
import { loadedState } from '../../web/src/lib/query-state-rules.ts';

describe('loadedState', () => {
  it('is loading before any data or error', () => {
    expect(loadedState(undefined, null)).toEqual({ status: 'loading' });
  });

  it('fails with the error message when there is no data to show', () => {
    expect(loadedState(undefined, new Error('offline'))).toEqual({ status: 'failed', problem: 'offline' });
  });

  it('shows the data once it arrived', () => {
    expect(loadedState({ level: 3 }, null)).toEqual({ status: 'ready', data: { level: 3 } });
  });

  it('keeps showing the last data when a background refresh failed', () => {
    expect(loadedState({ level: 3 }, new Error('offline'))).toEqual({ status: 'ready', data: { level: 3 } });
  });
});
