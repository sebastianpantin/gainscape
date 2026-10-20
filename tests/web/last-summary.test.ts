import type { SessionSummary } from '@domain/types.ts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetLastSummary, recallLastSummary, rememberLastSummary } from '../../web/src/offline/last-summary.ts';
import { MemoryStorage } from './memory-storage.ts';

const summary = {
  sessionId: 'session-a',
  xpBySkill: { legs: 100 },
  levelUps: [],
  prs: [],
  drops: [],
} as unknown as SessionSummary;

const userId = '11111111-1111-4111-8111-111111111111';
const otherUserId = '22222222-2222-4222-8222-222222222222';

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  vi.stubGlobal('sessionStorage', storage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('last summary', () => {
  it('recalls the summary it remembered', () => {
    rememberLastSummary(userId, summary);
    expect(recallLastSummary(userId)).toEqual(summary);
  });

  it('recalls nothing for another account signed in later in the same tab', () => {
    rememberLastSummary(userId, summary);
    expect(recallLastSummary(otherUserId)).toBeNull();
    expect(recallLastSummary(userId)).toEqual(summary);
  });

  it('recalls nothing from an entry saved before summaries named their account', () => {
    storage.setItem('gainscape.last-summary', JSON.stringify(summary));
    expect(recallLastSummary(userId)).toBeNull();
  });

  it('recalls the planned challenge next to the summary', () => {
    const plannedChallenge = {
      challengeId: 'challenge-dl',
      name: 'Deadlift and Pull-up',
      definition: {
        kind: 'prescription' as const,
        groups: [{ rounds: 5, exercises: [{ exerciseId: 'deadlift', reps: 5, pct: 70 }] }],
      },
      targetLoadsKg: { deadlift: 100 },
    };
    rememberLastSummary(userId, { ...summary, plannedChallenge });
    expect(recallLastSummary(userId)?.plannedChallenge).toEqual(plannedChallenge);
  });

  it('recalls a malformed planned challenge as null', () => {
    storage.setItem(
      'gainscape.last-summary',
      JSON.stringify({ userId, summary: { ...summary, plannedChallenge: { name: 7 } } }),
    );
    expect(recallLastSummary(userId)).toEqual({ ...summary, plannedChallenge: null });
  });

  it('recalls nothing when nothing was remembered or the entry is not JSON', () => {
    expect(recallLastSummary(userId)).toBeNull();
    storage.setItem('gainscape.last-summary', '{broken');
    expect(recallLastSummary(userId)).toBeNull();
  });

  it('forgets the summary only when its session is listed', () => {
    rememberLastSummary(userId, summary);
    forgetLastSummary(['session-b']);
    expect(recallLastSummary(userId)).toEqual(summary);
    forgetLastSummary(['session-b', 'session-a']);
    expect(recallLastSummary(userId)).toBeNull();
  });

  it('forgets a listed session whichever account remembered it', () => {
    rememberLastSummary(otherUserId, summary);
    forgetLastSummary(['session-a']);
    expect(recallLastSummary(otherUserId)).toBeNull();
  });

  it('degrades silently when session storage throws', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(() => rememberLastSummary(userId, summary)).not.toThrow();
    expect(recallLastSummary(userId)).toBeNull();
    expect(() => forgetLastSummary(['session-a'])).not.toThrow();
  });
});
