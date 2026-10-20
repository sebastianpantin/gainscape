import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_TITLE, routeTitle, SCREEN_PATHS } from '../../web/src/lib/platform/route-title-rules.ts';

const appSource = readFileSync(join(import.meta.dirname, '../../web/src/App.tsx'), 'utf8');
const ROUTE_PATHS = [...appSource.matchAll(/<Route\s+path="([^"]+)"/g)]
  .map(([, path]) => path)
  .filter((path) => path !== '*');

describe('SCREEN_PATHS', () => {
  it('lists exactly the routes App.tsx declares, so no screen falls back to the bare app title', () => {
    expect(ROUTE_PATHS.length).toBeGreaterThan(20);
    expect([...SCREEN_PATHS].sort()).toEqual([...ROUTE_PATHS].sort());
  });
});

describe('routeTitle', () => {
  it('names each tab screen before the app name', () => {
    expect(routeTitle('/')).toBe('Train · Gainscape');
    expect(routeTitle('/skills')).toBe('Skills · Gainscape');
    expect(routeTitle('/skills/quests')).toBe('Quests · Gainscape');
    expect(routeTitle('/collection')).toBe('Collection · Gainscape');
    expect(routeTitle('/friends')).toBe('Friends · Gainscape');
    expect(routeTitle('/profile')).toBe('Profile · Gainscape');
  });

  it('names nested screens', () => {
    expect(routeTitle('/reveal')).toBe('Workout saved · Gainscape');
    expect(routeTitle('/collection/items')).toBe('Items · Gainscape');
    expect(routeTitle('/collection/history')).toBe('History · Gainscape');
    expect(routeTitle('/collection/stats')).toBe('Stats · Gainscape');
    expect(routeTitle('/friends/hiscores')).toBe('Hiscores · Gainscape');
    expect(routeTitle('/profile/edit')).toBe('Edit profile · Gainscape');
    expect(routeTitle('/profile/preview')).toBe('What friends see · Gainscape');
    expect(routeTitle('/profile/settings')).toBe('Settings · Gainscape');
    expect(routeTitle('/profile/settings/whats-new')).toBe("What's new · Gainscape");
    expect(routeTitle('/exercises')).toBe('Exercises · Gainscape');
    expect(routeTitle('/programs')).toBe('Programs · Gainscape');
    expect(routeTitle('/programs/active')).toBe('Program · Gainscape');
    expect(routeTitle('/programs/active/plan')).toBe('Program plan · Gainscape');
    expect(routeTitle('/programs/new')).toBe('New program · Gainscape');
    expect(routeTitle('/skills/body')).toBe('Body · Gainscape');
  });

  it('matches routes with a parameter after the fixed routes they overlap', () => {
    expect(routeTitle('/collection/exercises/bench_press')).toBe('Exercise progress · Gainscape');
    expect(routeTitle('/collection/history/abc-123')).toBe('Workout · Gainscape');
    expect(routeTitle('/friends/abc-123')).toBe('Friend · Gainscape');
    expect(routeTitle('/skills/chest')).toBe('Skill · Gainscape');
    expect(routeTitle('/programs/enroll/stronglifts_5x5')).toBe('Follow program · Gainscape');
    expect(routeTitle('/programs/abc-123')).toBe('Edit program · Gainscape');
  });

  it('ignores a trailing slash', () => {
    expect(routeTitle('/skills/')).toBe('Skills · Gainscape');
  });

  it('falls back to the app name for an unknown path', () => {
    expect(APP_TITLE).toBe('Gainscape');
    expect(routeTitle('/nowhere')).toBe('Gainscape');
    expect(routeTitle('/collection/exercises')).toBe('Gainscape');
    expect(routeTitle('/friends/abc/extra')).toBe('Gainscape');
  });
});
