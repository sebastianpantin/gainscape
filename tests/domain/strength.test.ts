import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  effectiveReps,
  epley,
  estimateRir,
  type ExerciseStrength,
  intensityBonus,
  predictedMaxReps,
  processSession,
  replayHistory,
  type SessionInput,
  setXp,
  strengthStateAt,
  type StrengthHistoryRow,
} from '@domain/index.ts';
import { aSet, catalog, failure, freshUser, hard, TEST_BALANCE } from './fixtures.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const sessionStart = '2026-09-28T10:00:00.000Z';

function knownStrength(
  exerciseId: string,
  windowMax: number | null,
  fallbackMax: number | null = null,
): Record<string, ExerciseStrength> {
  return { [exerciseId]: { windowMax, fallbackMax, hasPriorSession: true } };
}

function runSets(
  sets: SessionInput['sets'],
  strength: Record<string, ExerciseStrength> = {},
  bodyweightKg: number | null = null,
) {
  const session: SessionInput = { id: 'session', startedAt: sessionStart, sets };
  return processSession({ skillXp: {}, bodyweightKg }, session, TEST_BALANCE, { catalog, strength }).outputs.sets;
}

function historyRow(
  exerciseId: string,
  sessionId: string,
  daysBefore: number,
  candidate: number | null,
  offsetMs = 0,
): StrengthHistoryRow {
  const startedAt = new Date(Date.parse(sessionStart) - daysBefore * DAY_MS - offsetMs).toISOString();
  return { exerciseId, session: { id: sessionId, startedAt }, isWarmup: false, strengthCandidate: candidate };
}

describe('epley and predicted max reps', () => {
  it('is exact at one rep to failure', () => {
    expect(epley(100, 1)).toBe(100);
  });

  it('rounds to two decimals', () => {
    expect(epley(100, 9)).toBe(126.67);
  });

  it.each([
    [80, 5, 100, 3],
    [80, 5, epley(80, 7), 2],
  ])('estimateRir(%d kg, %d reps, e1RM %d) = %d', (loadKg, reps, e1rm, expected) => {
    expect(estimateRir(loadKg, reps, e1rm)).toBe(expected);
  });

  it('predicts 8.5 reps at 80% of e1RM', () => {
    expect(predictedMaxReps(80, 100)).toBeCloseTo(8.5, 10);
  });

  it('round-trips between Epley and predicted max reps', () => {
    fc.assert(
      fc.property(fc.integer({ min: 20, max: 300 }), fc.integer({ min: 1, max: 12 }), (loadKg, repsToFailure) => {
        expect(predictedMaxReps(loadKg, epley(loadKg, repsToFailure))).toBeCloseTo(repsToFailure, 1);
      }),
    );
  });
});

describe('intensity bonus', () => {
  it.each([
    [75, 1, 50],
    [85, 1.15, 58],
    [95, 1.3, 65],
    [100, 1.3, 65],
  ])('at %s%% of e1RM the bonus is %s and 5 effective reps give %s XP', (loadKg, bonus, xp) => {
    expect(intensityBonus(loadKg, 100, TEST_BALANCE)).toBeCloseTo(bonus, 10);
    expect(setXp(5, intensityBonus(loadKg, 100, TEST_BALANCE), TEST_BALANCE)).toBe(xp);
  });

  it('is neutral without an e1RM', () => {
    expect(intensityBonus(100, null, TEST_BALANCE)).toBe(1);
  });
});

describe('effort resolution with a known e1RM', () => {
  it('estimates RIR for an unrated set', () => {
    const [result] = runSets([aSet('bench', 80, 5, null)], knownStrength('bench', 100));
    expect(result).toMatchObject({ rir: 3, rirSource: 'estimated', rirForXp: 3, e1rmBeforeKg: 100 });
  });

  it('caps XP for implausibly low logged RIR and flags the set', () => {
    const [result] = runSets([aSet('bench', 80, 3, failure)], knownStrength('bench', 100));
    expect(result).toMatchObject({ rir: 0, rirSource: 'logged', rirForXp: 2, rirFlagged: true });
  });

  it('trusts logged RIR within the margin', () => {
    const [result] = runSets([aSet('bench', 80, 5, hard)], knownStrength('bench', 100));
    expect(result).toMatchObject({ rir: 3, rirForXp: 3, rirFlagged: false });
  });

  it('caps logged strength growth at 10% per session', () => {
    const [result] = runSets([aSet('bench', 100, 10, failure)], knownStrength('bench', 100));
    expect(result.e1rmCandidateKg).toBe(110);
  });

  it('does not cap demonstrated strength from an unrated set', () => {
    const [result] = runSets([aSet('bench', 100, 10, null)], knownStrength('bench', 100));
    expect(result).toMatchObject({ rir: 0, rirSource: 'estimated', e1rmCandidateKg: 130 });
  });

  it('produces no candidate from an unrated set that does not beat its prediction', () => {
    const [result] = runSets([aSet('bench', 80, 5, null)], knownStrength('bench', 100));
    expect(result.e1rmCandidateKg).toBeNull();
  });

  it('clamps logged RIR used for strength at 5', () => {
    const [result] = runSets([aSet('bench', 50, 1, { type: 'rir', value: 10 })], knownStrength('bench', 100));
    expect(result.e1rmCandidateKg).toBe(epley(50, 6));
  });

  it('gives no estimate and no candidate for a zero load', () => {
    const [result] = runSets([aSet('bench', 0, 10, null)], knownStrength('bench', 100));
    expect(result).toMatchObject({ rir: null, rirSource: 'cold_start', xp: 0, e1rmCandidateKg: null });
  });
});

describe('cold start in the baseline session', () => {
  it('pays the cold-start XP for every unrated built-in set', () => {
    const results = runSets([aSet('bench', 60, 8, null), aSet('bench', 60, 8, null), aSet('bench', 60, 8, null)]);
    expect(results.map((result) => [result.rirSource, result.xp])).toEqual([
      ['cold_start', 10],
      ['cold_start', 10],
      ['cold_start', 10],
    ]);
  });

  it('pays nothing for a custom exercise', () => {
    const [result] = runSets([aSet('custom-press', 60, 8, null)]);
    expect(result).toMatchObject({ rirSource: 'cold_start', xp: 0 });
  });

  it('pays nothing for a warm-up', () => {
    const [result] = runSets([aSet('bench', 40, 10, null, { isWarmup: true })]);
    expect(result).toMatchObject({ rirSource: 'cold_start', xp: 0, e1rmCandidateKg: null });
  });

  it('seeds the e1RM assuming 2 reps in reserve', () => {
    const [result] = runSets([aSet('bench', 60, 8, null)]);
    expect(result.e1rmCandidateKg).toBe(epley(60, 10));
  });
});

describe('bodyweight exercises', () => {
  it('estimates RIR from reps capacity', () => {
    const [result] = runSets([aSet('pull-up', 0, 8, null)], knownStrength('pull-up', 12), 80);
    expect(result).toMatchObject({
      rir: 4,
      rirSource: 'estimated',
      repsCapacityBefore: 12,
      e1rmBeforeKg: null,
      intensityBonus: 1,
    });
  });

  it('records reps capacity as the candidate', () => {
    const [result] = runSets([aSet('pull-up', 0, 10, hard)], knownStrength('pull-up', 12), 80);
    expect(result.repsCapacityCandidate).toBe(13);
  });
});

describe('review regressions', () => {
  it('keeps reps capacity whole for a half-step logged RPE on a bodyweight exercise', () => {
    const [result] = runSets([aSet('pull-up', 0, 10, { type: 'rpe', value: 8.5 })], knownStrength('pull-up', 12), 80);
    expect(result.repsCapacityCandidate).toBe(11);
  });

  it('builds strength from an unrated set after the baseline when nothing is known yet', () => {
    const [result] = runSets([aSet('bench', 60, 8, null)], {
      bench: { windowMax: null, fallbackMax: null, hasPriorSession: true },
    });
    expect(result).toMatchObject({ rirSource: 'cold_start', xp: 0, e1rmCandidateKg: epley(60, 10) });
  });

  it('caps reps-capacity growth without float noise', () => {
    const [result] = runSets([aSet('pull-up', 0, 60, failure)], knownStrength('pull-up', 50), 80);
    expect(result.repsCapacityCandidate).toBe(55);
  });
});

describe('strength state at a session', () => {
  it('includes a candidate exactly 56 days old and excludes one a millisecond older', () => {
    const state = strengthStateAt(
      [historyRow('bench', 'a', 56, 120), historyRow('bench', 'b', 56, 130, 1)],
      { id: 'now', startedAt: sessionStart },
      TEST_BALANCE,
    );
    expect(state.bench.windowMax).toBe(120);
  });

  it('falls back to the best candidate of the most recent session with candidates', () => {
    const state = strengthStateAt(
      [
        historyRow('bench', 'old', 100, 120),
        historyRow('bench', 'recent', 70, 100),
        historyRow('bench', 'recent', 70, 105),
      ],
      { id: 'now', startedAt: sessionStart },
      TEST_BALANCE,
    );
    expect(state.bench).toEqual({ windowMax: null, fallbackMax: 105, hasPriorSession: true });
  });

  it('ignores sessions that start after the current one', () => {
    const state = strengthStateAt(
      [historyRow('bench', 'future', -1, 120)],
      { id: 'now', startedAt: sessionStart },
      TEST_BALANCE,
    );
    expect(state.bench).toBeUndefined();
  });

  it('lets fresh evidence replace a stale fallback within a session', () => {
    const results = runSets([aSet('bench', 50, 5, hard), aSet('bench', 50, 5, null)], {
      bench: { windowMax: null, fallbackMax: 100, hasPriorSession: true },
    });
    expect(results[0].e1rmBeforeKg).toBe(100);
    expect(results[1].e1rmBeforeKg).toBe(epley(50, 8));
  });
});

describe('strength properties', () => {
  it('never awards more XP for a higher RIR', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 30 }),
        fc.integer({ min: 0, max: 10 }),
        fc.integer({ min: 0, max: 10 }),
        fc.double({ min: 1, max: 1.3, noNaN: true }),
        (reps, rirA, rirB, bonus) => {
          const [lower, higher] = rirA <= rirB ? [rirA, rirB] : [rirB, rirA];
          const xpAtLower = setXp(effectiveReps(reps, lower, false, TEST_BALANCE), bonus, TEST_BALANCE);
          const xpAtHigher = setXp(effectiveReps(reps, higher, false, TEST_BALANCE), bonus, TEST_BALANCE);
          expect(xpAtLower).toBeGreaterThanOrEqual(xpAtHigher);
        },
      ),
    );
  });

  it('never raises strength from an unrated set that does not beat its prediction', () => {
    fc.assert(
      fc.property(fc.integer({ min: 40, max: 250 }), fc.double({ min: 0.4, max: 1, noNaN: true }), (e1rm, fraction) => {
        const loadKg = Math.max(1, Math.round(e1rm * fraction));
        const achievableReps = Math.max(1, Math.floor(predictedMaxReps(loadKg, e1rm)));
        const [result] = runSets([aSet('bench', loadKg, achievableReps, null)], knownStrength('bench', e1rm));
        expect(result.e1rmCandidateKg === null || result.e1rmCandidateKg <= e1rm).toBe(true);
      }),
    );
  });

  it('does not decay under constant training', () => {
    const sessions: SessionInput[] = Array.from({ length: 40 }, (_, index) => ({
      id: `week-${String(index).padStart(3, '0')}`,
      startedAt: new Date(Date.parse(sessionStart) + index * 3.5 * DAY_MS).toISOString(),
      sets: [aSet('bench', 80, 5, index % 3 === 0 ? hard : null), aSet('bench', 80, 5, null)],
    }));
    const replay = replayHistory(sessions, catalog, TEST_BALANCE, freshUser);
    const e1rmBeforeEachSession = replay.sessions.slice(1).map((entry) => entry.outputs.sets[0].e1rmBeforeKg);
    const firstKnown = e1rmBeforeEachSession[0]!;
    for (const e1rm of e1rmBeforeEachSession) expect(e1rm).toBeGreaterThanOrEqual(firstKnown);
  });

  it('replays the same regardless of input order', () => {
    const sessions: SessionInput[] = [0, 1, 2, 3].map((index) => ({
      id: `s${index}`,
      startedAt: new Date(Date.parse(sessionStart) + index * DAY_MS).toISOString(),
      sets: [aSet('bench', 60 + index * 5, 5, index % 2 === 0 ? hard : null), aSet('squat', 100, 5, null)],
    }));
    const inOrder = replayHistory(sessions, catalog, TEST_BALANCE);
    const shuffled = replayHistory([sessions[2], sessions[0], sessions[3], sessions[1]], catalog, TEST_BALANCE);
    expect(shuffled).toEqual(inOrder);
  });

  it('replays a prefix exactly as the start of the full replay', () => {
    const sessions: SessionInput[] = [0, 1, 2].map((index) => ({
      id: `p${index}`,
      startedAt: new Date(Date.parse(sessionStart) + index * DAY_MS).toISOString(),
      sets: [aSet('bench', 70, 6, null), aSet('bench', 72.5, 5, hard)],
    }));
    const full = replayHistory(sessions, catalog, TEST_BALANCE);
    const prefix = replayHistory(sessions.slice(0, 2), catalog, TEST_BALANCE);
    expect(full.sessions.slice(0, 2)).toEqual(prefix.sessions);
  });
});
