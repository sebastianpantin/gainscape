import { describe, expect, it } from 'vitest';
import {
  bodyStatusFrom,
  PROFILE_FAILED_TEXT,
  RECENT_SETS_FAILED_TEXT,
} from '../../web/src/lib/progress/body-status-rules.ts';

const NOW = Date.parse('2026-10-14T12:00:00.000Z');
const BENCH = {
  id: 'bench',
  name: 'Barbell Bench Press',
  skillShares: [{ skillKey: 'chest', skillName: 'Chest', shareBasisPoints: 7000 }],
};
const SET = { exerciseId: 'bench', endedAt: '2026-10-14T11:00:00.000Z', localDate: '2026-10-14', rir: 0 };
const LOADING = { data: undefined, error: null };
const FAILED = { data: undefined, error: new Error('injected failure') };

function status(overrides: Partial<Parameters<typeof bodyStatusFrom>[0]> = {}) {
  return bodyStatusFrom({
    recent: { data: [SET], error: null, updatedAt: NOW },
    exercises: { data: [BENCH], error: null },
    profile: { data: { timezone: 'UTC' }, error: null },
    openedAt: NOW,
    ...overrides,
  });
}

describe('bodyStatusFrom', () => {
  it('computes recovery load and weekly sets once everything has loaded', () => {
    const { recovery, volume } = status();
    expect(recovery.status === 'ready' && recovery.data.chest).toBeGreaterThan(0);
    expect(volume.status === 'ready' && volume.data.chest.sets).toBe(0.7);
  });

  it('is loading while recent sets, exercises or the profile are on their way', () => {
    expect(status({ recent: { ...LOADING, updatedAt: 0 } })).toEqual({
      recovery: { status: 'loading' },
      volume: { status: 'loading' },
    });
    expect(status({ exercises: LOADING }).volume).toEqual({ status: 'loading' });
    const waitingForProfile = status({ profile: LOADING });
    expect(waitingForProfile.recovery.status).toBe('ready');
    expect(waitingForProfile.volume).toEqual({ status: 'loading' });
  });

  it('fails both halves with one sentence when recent sets or exercises fail, even if the profile also failed', () => {
    const failed = { status: 'failed', problem: RECENT_SETS_FAILED_TEXT };
    expect(status({ recent: { ...FAILED, updatedAt: 0 }, profile: FAILED })).toEqual({
      recovery: failed,
      volume: failed,
    });
    expect(status({ exercises: FAILED })).toEqual({ recovery: failed, volume: failed });
  });

  it('keeps recovery and blames the profile when only the profile fails', () => {
    const onlyProfile = status({ profile: FAILED });
    expect(onlyProfile.recovery.status).toBe('ready');
    expect(onlyProfile.volume).toEqual({ status: 'failed', problem: PROFILE_FAILED_TEXT });
  });

  it('fails recent sets over a still loading profile', () => {
    expect(status({ recent: { ...FAILED, updatedAt: 0 }, profile: LOADING }).volume).toEqual({
      status: 'failed',
      problem: RECENT_SETS_FAILED_TEXT,
    });
  });
});
