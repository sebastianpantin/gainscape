import { describe, expect, it } from 'vitest';
import { activeTabPath } from '../../web/src/lib/platform/tab-rules.ts';

const TAB_PATHS = ['/', '/skills', '/collection', '/friends', '/profile'];

describe('activeTabPath', () => {
  it.each([
    ['/', '/'],
    ['/skills', '/skills'],
    ['/skills/quests', '/skills'],
    ['/collection/history/abc', '/collection'],
    ['/friends/hiscores', '/friends'],
    ['/profile/settings/whats-new', '/profile'],
  ])('puts %s under the %s tab', (pathname, tab) => {
    expect(activeTabPath(pathname, TAB_PATHS)).toBe(tab);
  });

  it('puts /exercises, opened from Profile, under the Profile tab without changing its URL', () => {
    expect(activeTabPath('/exercises', TAB_PATHS)).toBe('/profile');
  });

  it.each([
    '/programs',
    '/programs/enroll/stronglifts_5x5',
    '/programs/new',
    '/programs/activex',
    '/programs/active',
    '/programs/active/plan',
  ])('puts %s, where you choose and follow what you train, under the Train tab', (pathname) => {
    expect(activeTabPath(pathname, TAB_PATHS)).toBe('/');
  });

  it('lights no tab for the reveal', () => {
    expect(activeTabPath('/reveal', TAB_PATHS)).toBeNull();
  });

  it('matches whole path segments, so /skillset is not under Skills and /programsx not under Train', () => {
    expect(activeTabPath('/skillset', TAB_PATHS)).toBeNull();
    expect(activeTabPath('/programsx', TAB_PATHS)).toBeNull();
  });
});
