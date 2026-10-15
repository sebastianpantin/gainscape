import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  compareSessionKeys,
  DEFAULT_BALANCE,
  type LiftSetInput,
  processSession,
  type ReplayedSession,
  replayHistory,
  type SessionInput,
  type SessionKey,
  strengthHistoryRows,
  type StrengthHistoryRow,
  strengthStateAt,
  type UserState,
} from '@domain/index.ts';
import { strengthTracker } from '@domain/strength-tracker.ts';
import { catalog, DAY_MS, hard, nearFailure } from './fixtures.ts';

const cfg = DEFAULT_BALANCE;
const HISTORY_START_MS = Date.parse('2026-01-01T06:00:00.000Z');
const EXERCISES = ['bench', 'squat', 'custom-press', 'missing-lift'] as const;

const sessionKeyArb = fc
  .record({
    day: fc.integer({ min: 0, max: 200 }),
    minute: fc.integer({ min: 0, max: 3 }),
    id: fc.constantFrom('a', 'b', 'c'),
  })
  .map(({ day, minute, id }): SessionKey => ({
    id: `${id}-${day}-${minute}`,
    startedAt: new Date(HISTORY_START_MS + day * DAY_MS + minute * 60_000).toISOString(),
  }));

const historyRowArb = fc.record({
  exerciseId: fc.constantFrom(...EXERCISES),
  session: sessionKeyArb,
  isWarmup: fc.boolean(),
  strengthCandidate: fc.option(fc.integer({ min: 20, max: 300 }), { nil: null }),
});

function ascendingDistinct(keys: readonly SessionKey[]): SessionKey[] {
  const byId = new Map(keys.map((key) => [key.id, key]));
  return [...byId.values()].sort(compareSessionKeys);
}

describe('strengthTracker', () => {
  it('matches strengthStateAt for every session of an ascending walk', () => {
    fc.assert(
      fc.property(
        fc.array(historyRowArb, { maxLength: 120 }),
        fc.array(historyRowArb, { maxLength: 120 }),
        fc.array(sessionKeyArb, { minLength: 1, maxLength: 60 }),
        (priorRows, laterRows, sessionKeys) => {
          const tracker = strengthTracker(priorRows, cfg);
          const recorded: StrengthHistoryRow[] = [];
          for (const session of ascendingDistinct(sessionKeys)) {
            expect(tracker.stateAt(session)).toEqual(strengthStateAt([...priorRows, ...recorded], session, cfg));
            const ownRows = laterRows.filter((row) => row.session.id === session.id);
            const rows = ownRows.map((row) => ({ ...row, session }));
            tracker.record(rows);
            recorded.push(...rows);
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('strengthTracker order contract', () => {
  const earlier: SessionKey = { id: 'earlier', startedAt: '2026-01-01T06:00:00.000Z' };
  const later: SessionKey = { id: 'later', startedAt: '2026-01-02T06:00:00.000Z' };
  const rowAt = (session: SessionKey): StrengthHistoryRow => ({
    exerciseId: 'bench',
    session,
    isWarmup: false,
    strengthCandidate: 100,
  });

  it('accepts the same session twice and later sessions after it', () => {
    const tracker = strengthTracker([], cfg);
    tracker.stateAt(earlier);
    tracker.stateAt(earlier);
    tracker.record([rowAt(earlier), rowAt(earlier)]);
    expect(tracker.stateAt(later).bench.windowMax).toBe(100);
  });

  it('refuses a session before the last one it answered', () => {
    const tracker = strengthTracker([], cfg);
    tracker.stateAt(later);
    expect(() => tracker.stateAt(earlier)).toThrow(RangeError);
  });

  it('refuses rows recorded out of session order', () => {
    expect(() => strengthTracker([], cfg).record([rowAt(later), rowAt(earlier)])).toThrow(RangeError);
    const tracker = strengthTracker([], cfg);
    tracker.record([rowAt(later)]);
    expect(() => tracker.record([rowAt(earlier)])).toThrow(RangeError);
  });
});

const liftSetArb = fc.record({
  exerciseId: fc.constantFrom('bench', 'squat', 'custom-press'),
  weightKg: fc.integer({ min: 8, max: 80 }).map((plates) => plates * 2.5),
  reps: fc.integer({ min: 1, max: 15 }),
  isWarmup: fc.boolean(),
  effort: fc.constantFrom<LiftSetInput['effort']>(hard, nearFailure, null, { type: 'rir', value: 2 }),
});

const sessionArb = fc.record({
  day: fc.integer({ min: 0, max: 400 }),
  hour: fc.integer({ min: 0, max: 23 }),
  sets: fc.array(liftSetArb, { minLength: 1, maxLength: 5 }),
});

function sessionsFrom(drafts: readonly { day: number; hour: number; sets: Omit<LiftSetInput, 'id' | 'position'>[] }[]) {
  return drafts.map((draft, sessionIndex): SessionInput => ({
    id: `session-${String(sessionIndex).padStart(4, '0')}`,
    startedAt: new Date(HISTORY_START_MS + draft.day * DAY_MS + draft.hour * 3_600_000).toISOString(),
    sets: draft.sets.map((set, position) => ({ ...set, id: `set-${sessionIndex}-${position}`, position })),
  }));
}

function replayRescanningHistory(
  sessions: readonly SessionInput[],
  priorStrength: readonly StrengthHistoryRow[],
): ReplayedSession[] {
  const history = [...priorStrength];
  const replayed: ReplayedSession[] = [];
  let state: UserState = { skillXp: {}, bodyweightKg: null };
  for (const session of [...sessions].sort(compareSessionKeys)) {
    const strength = strengthStateAt(history, session, cfg);
    const { nextState, outputs } = processSession(state, session, cfg, { catalog, strength });
    history.push(...strengthHistoryRows(session, outputs.sets));
    replayed.push({ session, strengthAtStart: strength, outputs });
    state = nextState;
  }
  return replayed;
}

describe('replayHistory with the incremental strength fold', () => {
  it('equals a replay that rescans the whole strength history before every session', () => {
    fc.assert(
      fc.property(
        fc.array(sessionArb, { minLength: 50, maxLength: 300 }),
        fc.array(historyRowArb, { maxLength: 40 }),
        (drafts, priorRows) => {
          const sessions = sessionsFrom(drafts);
          const earliest = sessions.reduce((first, session) =>
            compareSessionKeys(session, first) < 0 ? session : first,
          );
          const priorStrength = priorRows.map((row, index) => ({
            ...row,
            session: {
              id: `prior-${index}`,
              startedAt: new Date(Date.parse(earliest.startedAt) - (index + 1) * DAY_MS).toISOString(),
            },
          }));
          expect(replayHistory(sessions, catalog, cfg, undefined, priorStrength).sessions).toEqual(
            replayRescanningHistory(sessions, priorStrength),
          );
        },
      ),
      { numRuns: 25 },
    );
  });
});
