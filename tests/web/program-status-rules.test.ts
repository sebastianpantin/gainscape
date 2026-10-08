import { describe, expect, it } from 'vitest';
import { offlineRefreshState, programLoadStatus, programStatusText } from '../../web/src/lib/program-status-rules.ts';

describe('program load status', () => {
  it('shows the cache while a refresh runs when an enrollment is cached', () => {
    expect(programLoadStatus({ hasCachedEnrollment: true, refresh: 'pending' })).toBe('cached');
  });

  it('is refreshing while a refresh runs with nothing cached', () => {
    expect(programLoadStatus({ hasCachedEnrollment: false, refresh: 'pending' })).toBe('refreshing');
  });

  it('is cached after a refresh that found an enrollment', () => {
    expect(programLoadStatus({ hasCachedEnrollment: true, refresh: 'done' })).toBe('cached');
  });

  it('is none after a refresh that found no enrollment', () => {
    expect(programLoadStatus({ hasCachedEnrollment: false, refresh: 'done' })).toBe('none');
  });

  it('keeps showing the cache when a refresh fails with an enrollment cached', () => {
    expect(programLoadStatus({ hasCachedEnrollment: true, refresh: 'failed' })).toBe('cached');
  });

  it('is failed when a refresh fails with nothing cached', () => {
    expect(programLoadStatus({ hasCachedEnrollment: false, refresh: 'failed' })).toBe('failed');
  });
});

describe('program status text', () => {
  it('reads "Loading program…" while refreshing', () => {
    expect(programStatusText('refreshing')).toBe('Loading program…');
  });

  it('reads "You\'re not following a program." when there is none', () => {
    expect(programStatusText('none')).toBe("You're not following a program.");
  });

  it('asks to reconnect when loading failed', () => {
    expect(programStatusText('failed')).toBe("Couldn't load your program. Check your connection.");
  });

  it('shows no status text for a cached program', () => {
    expect(programStatusText('cached')).toBeNull();
  });
});

describe('program refresh state while offline', () => {
  it('trusts the saved cache as done when it was refreshed online before', () => {
    expect(offlineRefreshState({ refreshed: true })).toBe('done');
  });

  it('is failed when the saved cache was never refreshed online', () => {
    expect(offlineRefreshState({})).toBe('failed');
  });
});
