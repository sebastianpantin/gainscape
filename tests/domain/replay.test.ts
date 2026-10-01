import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  type Catalog,
  compareSessionKeys,
  DEFAULT_BALANCE,
  DEFAULT_STEPS,
  type EffortInput,
  type ExerciseDef,
  isBefore,
  priorSkillXp,
  type RecordHistoryRow,
  recordsFromHistory,
  type ReplayedSession,
  replayHistory,
  type SessionInput,
  type SessionKey,
  type SetInput,
  strengthHistoryRows,
  type StrengthHistoryRow,
} from '@domain/index.ts';
import { catalog as fixtureCatalog, DAY_MS, HOUR_MS } from './fixtures.ts';

const cfg = DEFAULT_BALANCE;
const HISTORY_START_MS = Date.parse('2026-01-01T06:00:00.000Z');

const extraExercises: ExerciseDef[] = [
  {
    id: 'weighted-dip',
    loadType: 'bodyweight_plus',
    builtIn: true,
    shares: [
      { skillId: 'skill-chest', shareBasisPoints: 5000 },
      { skillId: 'skill-arms', shareBasisPoints: 3500 },
      { skillId: 'skill-shoulders', shareBasisPoints: 1500 },
    ],
  },
  {
    id: 'ohp',
    loadType: 'external',
    builtIn: true,
    shares: [
      { skillId: 'skill-shoulders', shareBasisPoints: 8000 },
      { skillId: 'skill-arms', shareBasisPoints: 2000 },
    ],
  },
];

const catalog: Catalog = {
  skills: fixtureCatalog.skills,
  exercises: new Map([
    ...[...fixtureCatalog.exercises].filter(([id]) => id !== 'weighted-pull-up'),
    ...extraExercises.map((exercise) => [exercise.id, exercise] as const),
  ]),
};

const EXERCISE_IDS = ['bench', 'squat', 'pull-up', 'weighted-dip', 'custom-press', 'ohp'] as const;
const WARMUP_ONLY_EXERCISE = 'ohp';

const effortArb: fc.Arbitrary<EffortInput> = fc.oneof(
  fc.constant(null),
  fc
    .constantFrom('easy', 'hard', 'near_failure', 'failure' as const)
    .map((level) => ({ type: 'level', level }) as const),
  fc.integer({ min: 0, max: 20 }).map((halfSteps) => ({ type: 'rir', value: halfSteps / 2 }) as const),
);

const setDraftArb = fc.record({
  exerciseId: fc.constantFrom(...EXERCISE_IDS),
  loadSteps: fc.integer({ min: 0, max: 80 }),
  reps: fc.integer({ min: 1, max: 15 }),
  warmupRoll: fc.integer({ min: 0, max: 4 }),
  effort: effortArb,
});

const sessionDraftArb = fc.record({
  bodyweightHalfKg: fc.integer({ min: 120, max: 200 }),
  warmupOnlyThisSession: fc.boolean(),
  sets: fc.array(setDraftArb, { minLength: 1, maxLength: 6 }),
});

type SessionDraft = typeof sessionDraftArb extends fc.Arbitrary<infer T> ? T : never;

function buildSets(sessionId: string, draft: SessionDraft, idPrefix: string): SetInput[] {
  const bodyweightKg = draft.bodyweightHalfKg / 2;
  return draft.sets.map((setDraft, position) => {
    const loadType = catalog.exercises.get(setDraft.exerciseId)!.loadType;
    const weightKg =
      loadType === 'bodyweight'
        ? 0
        : loadType === 'bodyweight_plus'
          ? (setDraft.loadSteps % 17) * 2.5
          : setDraft.loadSteps * 2.5;
    const forcedWarmup = setDraft.exerciseId === WARMUP_ONLY_EXERCISE && draft.warmupOnlyThisSession;
    return {
      id: `${sessionId}:${idPrefix}${position}`,
      exerciseId: setDraft.exerciseId,
      position,
      weightKg,
      reps: setDraft.reps,
      isWarmup: forcedWarmup || setDraft.warmupRoll === 0,
      effort: setDraft.effort,
      recordedEffectiveLoadKg: loadType === 'external' ? weightKg : bodyweightKg + weightKg,
    };
  });
}

interface GeneratedHistory {
  sessions: SessionInput[];
  cut: number;
  editIndex: number;
  editedSets: SetInput[];
}

const historyArb: fc.Arbitrary<GeneratedHistory> = fc.integer({ min: 3, max: 12 }).chain((count) =>
  fc
    .record({
      ids: fc.uniqueArray(fc.uuid(), { minLength: count, maxLength: count }),
      gapHours: fc.array(fc.integer({ min: 1, max: 40 * 24 }), { minLength: count - 1, maxLength: count - 1 }),
      bigGapIndex: fc.nat(count - 2),
      tieOffset: fc.nat(),
      bigGapExtraHours: fc.integer({ min: 1, max: 30 * 24 }),
      drafts: fc.array(sessionDraftArb, { minLength: count, maxLength: count }),
      cut: fc.nat(count - 1),
      editIndex: fc.nat(count - 1),
      editDraft: sessionDraftArb,
    })
    .map((drawn) => {
      const gaps = drawn.gapHours.map((hours) => hours * HOUR_MS);
      const tieIndex = (drawn.bigGapIndex + 1 + (drawn.tieOffset % (count - 2 || 1))) % (count - 1);
      gaps[tieIndex] = 0;
      const otherGapsMs = gaps.reduce((sum, gap, index) => (index === drawn.bigGapIndex ? sum : sum + gap), 0);
      gaps[drawn.bigGapIndex] = Math.max(57 * DAY_MS, 150 * DAY_MS - otherGapsMs) + drawn.bigGapExtraHours * HOUR_MS;

      let startMs = HISTORY_START_MS;
      const sessions = drawn.ids.map((id, index) => {
        if (index > 0) startMs += gaps[index - 1];
        return { id, startedAt: new Date(startMs).toISOString(), sets: buildSets(id, drawn.drafts[index], 's') };
      });
      const ordered = [...sessions].sort(compareSessionKeys);
      const edited = ordered[drawn.editIndex];
      return {
        sessions: ordered,
        cut: drawn.cut,
        editIndex: drawn.editIndex,
        editedSets: buildSets(edited.id, drawn.editDraft, 'e'),
      };
    }),
);

function keyOf(session: SessionInput): SessionKey {
  return { id: session.id, startedAt: session.startedAt };
}

function strengthRowsOf(replayed: readonly ReplayedSession[]): StrengthHistoryRow[] {
  return replayed.flatMap((entry) => strengthHistoryRows(keyOf(entry.session), entry.outputs.sets));
}

function recordRowsOf(sessions: readonly SessionInput[]): RecordHistoryRow[] {
  return sessions.flatMap((session) =>
    session.sets
      .filter((set) => !set.isWarmup)
      .map((set) => ({
        exerciseId: set.exerciseId,
        session: keyOf(session),
        setId: set.id,
        position: set.position,
        weightKg: set.weightKg,
        reps: set.reps,
      })),
  );
}

function skillXpSumsOf(replayed: readonly ReplayedSession[]): Record<string, number> {
  const sums: Record<string, number> = {};
  for (const part of replayed.flatMap((entry) => entry.outputs.sets.flatMap((result) => result.skillXp))) {
    sums[part.skillId] = (sums[part.skillId] ?? 0) + part.xp;
  }
  return sums;
}

function latestBy(sessions: readonly SessionKey[], pickLater: boolean): SessionKey | null {
  return sessions.reduce<SessionKey | null>((best, session) => {
    if (best === null) return session;
    const later = compareSessionKeys(session, best) > 0;
    return later === pickLater ? session : best;
  }, null);
}

function trim(
  rows: readonly StrengthHistoryRow[],
  anchor: SessionKey,
): { rows: StrengthHistoryRow[]; removed: number } {
  const prior = rows.filter((row) => isBefore(row.session, anchor));
  const windowStartMs = Date.parse(anchor.startedAt) - cfg.e1rmWindowDays * DAY_MS;
  const exerciseIds = [...new Set(prior.map((row) => row.exerciseId))];
  const latestWithCandidates = new Map(
    exerciseIds.map((exerciseId) => [
      exerciseId,
      latestBy(
        prior
          .filter((row) => row.exerciseId === exerciseId && row.strengthCandidate !== null)
          .map((row) => row.session),
        true,
      ),
    ]),
  );
  const selected = prior.filter(
    (row) =>
      Date.parse(row.session.startedAt) >= windowStartMs ||
      latestWithCandidates.get(row.exerciseId)?.id === row.session.id,
  );
  const firstWorkingSets = exerciseIds.flatMap((exerciseId) => {
    const first = latestBy(
      prior.filter((row) => row.exerciseId === exerciseId && !row.isWarmup).map((row) => row.session),
      false,
    );
    return first === null ? [] : [{ exerciseId, session: first, isWarmup: false, strengthCandidate: null }];
  });
  return { rows: [...selected, ...firstWorkingSets], removed: prior.length - selected.length };
}

interface SuffixCheck {
  expected: ReturnType<typeof replayHistory>;
  suffix: ReturnType<typeof replayHistory>;
  trimmedAway: number;
}

function replaySuffix(
  prefixSessions: readonly SessionInput[],
  suffixSessions: readonly SessionInput[],
  anchor: SessionKey,
  trimmed: boolean,
): { suffix: ReturnType<typeof replayHistory>; trimmedAway: number } {
  const prefix = replayHistory(prefixSessions, catalog, cfg);
  const priorStrength = strengthRowsOf(prefix.sessions);
  const trimmedStrength = trim(priorStrength, anchor);
  const suffix = replayHistory(
    suffixSessions,
    catalog,
    cfg,
    {
      skillXp: priorSkillXp(skillXpSumsOf(prefix.sessions), cfg),
      bodyweightKg: null,
      records: recordsFromHistory(recordRowsOf(prefixSessions), catalog, cfg),
    },
    DEFAULT_STEPS,
    trimmed ? trimmedStrength.rows : priorStrength,
  );
  return { suffix, trimmedAway: trimmedStrength.removed };
}

function checkSuffix(sessions: readonly SessionInput[], cut: number, anchor: SessionKey, trimmed = true): SuffixCheck {
  const expected = replayHistory(sessions, catalog, cfg);
  const { suffix, trimmedAway } = replaySuffix(sessions.slice(0, cut), sessions.slice(cut), anchor, trimmed);
  expect(suffix.sessions).toEqual(expected.sessions.slice(cut));
  expect(suffix.finalState).toEqual(expected.finalState);
  return { expected, suffix, trimmedAway };
}

function startedWithOnlyFallback(replayed: readonly ReplayedSession[]): boolean {
  return replayed.some((entry) =>
    entry.session.sets.some((set) => {
      const known = entry.strengthAtStart[set.exerciseId];
      return known !== undefined && known.windowMax === null && known.fallbackMax !== null;
    }),
  );
}

const RUNS = 300;

describe('replay from a stored prior state', () => {
  it('replays a suffix exactly like the full history, with the SQL trim applied', () => {
    let hits = 0;
    fc.assert(
      fc.property(historyArb, ({ sessions, cut }) => {
        const { suffix, trimmedAway } = checkSuffix(sessions, cut, keyOf(sessions[cut]));
        if (trimmedAway > 0 || startedWithOnlyFallback(suffix.sessions)) hits += 1;
      }),
      { numRuns: RUNS },
    );
    expect(hits).toBeGreaterThanOrEqual(0.2 * RUNS);
  });

  it('replays a suffix exactly like the full history without trimming', () => {
    fc.assert(
      fc.property(historyArb, ({ sessions, cut }) => {
        checkSuffix(sessions, cut, keyOf(sessions[cut]), false);
      }),
      { numRuns: RUNS },
    );
  });

  it('folds the records of every working set into the replayed record state', () => {
    fc.assert(
      fc.property(historyArb, ({ sessions }) => {
        const full = replayHistory(sessions, catalog, cfg);
        expect(recordsFromHistory(recordRowsOf(sessions), catalog, cfg)).toEqual(full.finalState.records);
      }),
      { numRuns: RUNS },
    );
  });

  it('replays an edited session as a suffix', () => {
    fc.assert(
      fc.property(historyArb, ({ sessions, editIndex, editedSets }) => {
        const edited = sessions.map((session, index) =>
          index === editIndex ? { ...session, sets: editedSets } : session,
        );
        checkSuffix(edited, editIndex, keyOf(sessions[editIndex]));
      }),
      { numRuns: RUNS },
    );
  });

  it('replays the sessions after a deleted one as a suffix', () => {
    fc.assert(
      fc.property(historyArb, ({ sessions, editIndex }) => {
        const remaining = sessions.filter((_, index) => index !== editIndex);
        checkSuffix(remaining, editIndex, keyOf(sessions[editIndex]));
      }),
      { numRuns: RUNS },
    );
  });
});

describe('replay budget', () => {
  const benchmarkExercises = ['bench', 'squat', 'pull-up', 'weighted-dip'];

  function benchmarkSession(index: number, startMs: number, setCount: number): SessionInput {
    const id = `bench-session-${String(index).padStart(5, '0')}`;
    return {
      id,
      startedAt: new Date(startMs).toISOString(),
      sets: Array.from({ length: setCount }, (_, position) => {
        const exerciseId = benchmarkExercises[position % benchmarkExercises.length];
        const loadType = catalog.exercises.get(exerciseId)!.loadType;
        const weightKg = loadType === 'bodyweight' ? 0 : 40 + ((index + position) % 30) * 2.5;
        return {
          id: `${id}:${position}`,
          exerciseId,
          position,
          weightKg,
          reps: 1 + ((index * 7 + position) % 12),
          isWarmup: position % 10 === 0,
          effort: position % 3 === 0 ? null : ({ type: 'level', level: 'hard' } as const),
          recordedEffectiveLoadKg: loadType === 'external' ? weightKg : 80 + weightKg,
        };
      }),
    };
  }

  const recordRows: RecordHistoryRow[] = Array.from({ length: 10_000 }, (_, index) => ({
    exerciseId: benchmarkExercises[index % benchmarkExercises.length],
    session: {
      id: `record-${Math.floor(index / 40)}`,
      startedAt: new Date(HISTORY_START_MS + Math.floor(index / 40) * DAY_MS).toISOString(),
    },
    setId: `record-set-${index}`,
    position: index % 40,
    weightKg: benchmarkExercises[index % benchmarkExercises.length] === 'pull-up' ? 0 : 20 + (index % 70) * 2.5,
    reps: 1 + (index % 15),
  }));

  const suffixStartMs = HISTORY_START_MS + 400 * DAY_MS;
  const priorStrength: StrengthHistoryRow[] = Array.from({ length: 3_000 }, (_, index) => ({
    exerciseId: benchmarkExercises[index % benchmarkExercises.length],
    session: {
      id: `prior-${String(Math.floor(index / 30)).padStart(5, '0')}`,
      startedAt: new Date(suffixStartMs - (100 - Math.floor(index / 30)) * DAY_MS).toISOString(),
    },
    isWarmup: index % 10 === 0,
    strengthCandidate: index % 10 === 0 ? null : 80 + (index % 20),
  }));
  const suffixSessions = Array.from({ length: 14 }, (_, index) =>
    benchmarkSession(index, suffixStartMs + (index * DAY_MS) / 2, 40),
  );

  function runBudgetedReplay() {
    const records = recordsFromHistory(recordRows, catalog, cfg);
    return replayHistory(
      suffixSessions,
      catalog,
      cfg,
      { skillXp: {}, bodyweightKg: null, records },
      DEFAULT_STEPS,
      priorStrength,
    );
  }

  it('folds 10 000 record rows and replays 14 × 40 sets over 3 000 prior rows within 200 ms', () => {
    runBudgetedReplay();
    const startedAt = performance.now();
    const replay = runBudgetedReplay();
    const elapsedMs = performance.now() - startedAt;
    expect(replay.sessions).toHaveLength(14);
    expect(elapsedMs).toBeLessThan(200);
  });
});
