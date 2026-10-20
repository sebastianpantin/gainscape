import { describe, expect, it } from 'vitest';
import { DEFAULT_BALANCE, type Position, programStateAt } from '@domain/index.ts';
import { orderFacts } from '@domain/program-state.ts';
import { type CardioActivity } from '../../web/src/lib/exercises/catalog-rules.ts';
import { type DraftSet, type WorkoutDraft } from '../../web/src/offline/draft-format.ts';
import {
  appendFinishedSession,
  beginFactsFetch,
  cachedProgramFacts,
  emptyProgramFactsCache,
  type FinishOutcomeForFacts,
  forgetDeletedSession,
  mergeFetchedFacts,
  type ProgramFactsCache,
  syncedSessionFact,
} from '../../web/src/offline/program-facts-cache.ts';
import { sessionFact, setReferenceFact, snapshot } from '../domain/program-fixtures/facts.ts';
import { MADCOW_5X5, madcowDaySets, madcowEnrollment, weekDay } from '../domain/program-fixtures/madcow_5x5.ts';

const madcow = madcowEnrollment();
const ENROLLMENT_ID = madcow.id;
const MONDAY_SESSION_ID = 'session-monday';
const WEDNESDAY_SESSION_ID = 'session-wednesday';
const MONDAY_COMPLETED_AT = '2026-10-05T07:00:00.000Z';
const WEDNESDAY_COMPLETED_AT = '2026-10-07T07:00:00.000Z';
const SQUAT_RAMP = snapshot('mon-squat:0', { weightKg: 70, reps: 5 });

const RUNNING: CardioActivity = {
  paceUnit: 'per_km',
  referencePaceSPerKm: 360,
  maxEffort: 'max',
  tracksDistance: true,
  shares: [{ skillKey: 'endurance', shareBasisPoints: 10_000 }],
};

function draftSet(id: string, weightKg: number, reps: number, extra: Partial<DraftSet> = {}): DraftSet {
  return { id, weightKg, reps, effort: null, done: true, isWarmup: false, prescription: null, ...extra };
}

function programDraftAt(sessionId: string, position: Position, enrollmentId = ENROLLMENT_ID): WorkoutDraft {
  return {
    sessionId,
    startedAt: '2026-10-05T06:00:00.000Z',
    finishedAt: '2026-10-05T06:55:00.000Z',
    programDayId: null,
    programLabel: 'Madcow 5x5',
    program: { enrollmentId, position, templateKey: 'madcow_5x5' },
    exercises: [
      {
        clientId: 'card-squat',
        exerciseId: 'squat',
        name: 'Squat',
        modality: 'lift',
        loadType: 'external',
        target: null,
        sets: [
          draftSet('squat-0', 70, 5, { effort: { type: 'rir', value: 2 }, prescription: SQUAT_RAMP }),
          draftSet('squat-extra', 60, 10, { effort: { type: 'level', level: 'hard' } }),
          draftSet('squat-planned', 80, 5, {
            done: false,
            prescription: snapshot('mon-squat:1', { weightKg: 80, reps: 5 }),
          }),
        ],
      },
      {
        clientId: 'card-run',
        exerciseId: 'run',
        name: 'Running',
        modality: 'cardio',
        activity: RUNNING,
        sets: [
          { id: 'bout-a', kind: 'cardio', durationS: 600, distanceM: null, interval: null, effort: null, done: true },
        ],
      },
    ],
  };
}

function mondayDraft(): WorkoutDraft {
  return programDraftAt(MONDAY_SESSION_ID, weekDay(1, 'mon'));
}

function wednesdayDraft(): WorkoutDraft {
  return programDraftAt(WEDNESDAY_SESSION_ID, weekDay(1, 'wed'));
}

function linkedSync(completedAt: string): FinishOutcomeForFacts {
  return { kind: 'synced', summary: { programLinked: true, completedAt } };
}

function serverMonday() {
  return sessionFact({ id: MONDAY_SESSION_ID, at: MONDAY_COMPLETED_AT }, weekDay(1, 'mon'), madcowDaySets('mon'));
}

function fetched(cache: ProgramFactsCache, startedAt: number, facts: Parameters<typeof mergeFetchedFacts>[2]) {
  return mergeFetchedFacts(cache, beginFactsFetch(cache, startedAt), facts);
}

function nextPosition(cache: ProgramFactsCache): Position {
  return programStateAt(MADCOW_5X5, madcow, cachedProgramFacts(cache)).position;
}

function idsOf(cache: ProgramFactsCache): string[] {
  return cachedProgramFacts(cache).map((fact) => fact.id);
}

function syncedMonday(appendedAt: number, cache = fetched(emptyProgramFactsCache(ENROLLMENT_ID), 0, [])) {
  return appendFinishedSession(cache, mondayDraft(), linkedSync(MONDAY_COMPLETED_AT), appendedAt);
}

describe('syncedSessionFact', () => {
  it('turns a synced program draft into a local session fact at the server completedAt', () => {
    expect(syncedSessionFact(mondayDraft(), MONDAY_COMPLETED_AT)).toEqual({
      kind: 'session',
      id: MONDAY_SESSION_ID,
      at: MONDAY_COMPLETED_AT,
      local: true,
      position: weekDay(1, 'mon'),
      sets: [
        {
          exerciseId: 'squat',
          weightKg: 70,
          reps: 5,
          effortInputType: 'rir',
          effortValue: 2,
          prescription: SQUAT_RAMP,
        },
        {
          exerciseId: 'squat',
          weightKg: 60,
          reps: 10,
          effortInputType: 'level',
          effortValue: DEFAULT_BALANCE.effortLevelRir.hard,
          prescription: null,
        },
      ],
    });
  });

  it('makes no fact of a draft that follows no program', () => {
    expect(syncedSessionFact({ ...mondayDraft(), program: null }, MONDAY_COMPLETED_AT)).toBeNull();
  });
});

describe('program facts cache', () => {
  it('starts empty for the enrollment, at generation 0', () => {
    expect(emptyProgramFactsCache(ENROLLMENT_ID)).toEqual({
      enrollmentId: ENROLLMENT_ID,
      generation: 0,
      serverFacts: [],
      localAppends: [],
    });
  });

  it('offers week 1 Monday while the Monday draft is still unsynced', () => {
    expect(nextPosition(fetched(emptyProgramFactsCache(ENROLLMENT_ID), 0, []))).toEqual(weekDay(1, 'mon'));
  });

  it('offers week 1 Wednesday offline once the Monday session has synced', () => {
    expect(nextPosition(syncedMonday(1_000))).toEqual(weekDay(1, 'wed'));
  });

  it('offers week 1 Friday offline once Monday and Wednesday have synced', () => {
    const cache = appendFinishedSession(
      syncedMonday(1_000),
      wednesdayDraft(),
      linkedSync(WEDNESDAY_COMPLETED_AT),
      2_000,
    );
    expect(nextPosition(cache)).toEqual(weekDay(1, 'fri'));
  });

  it('appends the synced session as a local fact at the completedAt the server returned', () => {
    expect(cachedProgramFacts(syncedMonday(1_000))).toEqual([syncedSessionFact(mondayDraft(), MONDAY_COMPLETED_AT)]);
  });

  it('appends a resubmitted session only once', () => {
    const twice = appendFinishedSession(syncedMonday(1_000), mondayDraft(), linkedSync(MONDAY_COMPLETED_AT), 1_500);
    expect(idsOf(twice)).toEqual([MONDAY_SESSION_ID]);
  });

  it('does not bump the generation when it appends', () => {
    expect(syncedMonday(1_000).generation).toBe(0);
  });

  it('appends nothing for an unlinked sync', () => {
    const outcome: FinishOutcomeForFacts = {
      kind: 'synced',
      summary: { programLinked: false, completedAt: MONDAY_COMPLETED_AT },
    };
    const cache = fetched(emptyProgramFactsCache(ENROLLMENT_ID), 0, []);
    expect(appendFinishedSession(cache, mondayDraft(), outcome, 1_000)).toEqual(cache);
  });

  it('appends nothing for a draft of another enrollment', () => {
    const cache = fetched(emptyProgramFactsCache(ENROLLMENT_ID), 0, []);
    const otherDraft = programDraftAt(MONDAY_SESSION_ID, weekDay(1, 'mon'), 'enrollment-other');
    expect(appendFinishedSession(cache, otherDraft, linkedSync(MONDAY_COMPLETED_AT), 1_000)).toEqual(cache);
  });

  it('counts the session exactly once after a later refetch lists it, keeping the server copy', () => {
    const refetched = fetched(syncedMonday(1_000), 2_000, [serverMonday()]);
    expect(cachedProgramFacts(refetched)).toEqual([serverMonday()]);
    expect(nextPosition(refetched)).toEqual(weekDay(1, 'wed'));
  });

  it('keeps the append through a refetch that started before the sync and missed it', () => {
    const reference = setReferenceFact({ id: 'event-1', at: '2026-10-05T05:00:00.000Z' }, 'squat', 'top', 95);
    const cache = fetched(emptyProgramFactsCache(ENROLLMENT_ID), 0, []);
    const ticket = beginFactsFetch(cache, 500);
    const synced = appendFinishedSession(cache, mondayDraft(), linkedSync(MONDAY_COMPLETED_AT), 1_000);

    const merged = mergeFetchedFacts(synced, ticket, [reference]);

    expect(idsOf(merged).sort()).toEqual(['event-1', MONDAY_SESSION_ID]);
    expect(nextPosition(merged)).toEqual(weekDay(1, 'wed'));
  });

  it('drops an append that a refetch started after the sync does not list', () => {
    const refetched = fetched(syncedMonday(1_000), 2_000, []);
    expect(idsOf(refetched)).toEqual([]);
    expect(nextPosition(refetched)).toEqual(weekDay(1, 'mon'));
  });

  it('forgets a deleted session at once and bumps the generation', () => {
    const deleted = forgetDeletedSession(syncedMonday(1_000), MONDAY_SESSION_ID);
    expect(idsOf(deleted)).toEqual([]);
    expect(deleted.generation).toBe(1);
    expect(nextPosition(deleted)).toEqual(weekDay(1, 'mon'));
  });

  it('forgets a deleted session that only the server copy knew', () => {
    const refetched = fetched(syncedMonday(1_000), 2_000, [serverMonday()]);
    expect(idsOf(forgetDeletedSession(refetched, MONDAY_SESSION_ID))).toEqual([]);
  });

  it('keeps the session dropped when a refetch after the delete no longer lists it', () => {
    const deleted = forgetDeletedSession(syncedMonday(1_000), MONDAY_SESSION_ID);
    expect(idsOf(fetched(deleted, 3_000, []))).toEqual([]);
  });

  it('discards an in-flight fetch that a delete overtook, so the session never comes back', () => {
    const synced = syncedMonday(1_000);
    const inFlight = beginFactsFetch(synced, 2_000);
    const deleted = forgetDeletedSession(synced, MONDAY_SESSION_ID);

    const merged = mergeFetchedFacts(deleted, inFlight, [serverMonday()]);

    expect(merged).toEqual(deleted);
    expect(idsOf(merged)).toEqual([]);
    expect(nextPosition(merged)).toEqual(weekDay(1, 'mon'));
  });

  it('applies a fetch begun after the delete', () => {
    const deleted = forgetDeletedSession(syncedMonday(1_000), MONDAY_SESSION_ID);
    const wednesday = sessionFact({ id: WEDNESDAY_SESSION_ID, at: WEDNESDAY_COMPLETED_AT }, weekDay(1, 'wed'), []);
    expect(idsOf(fetched(deleted, 3_000, [wednesday]))).toEqual([WEDNESDAY_SESSION_ID]);
  });

  it('discards a fetch ticket of another enrollment', () => {
    const other = fetched(emptyProgramFactsCache('enrollment-other'), 0, []);
    const ticket = beginFactsFetch(other, 2_000);
    const cache = syncedMonday(1_000);
    expect(mergeFetchedFacts(cache, ticket, [])).toEqual(cache);
  });

  it('folds the facts in the same order before and after a refetch, by server time and not by device time', () => {
    const reference = setReferenceFact({ id: 'event-1', at: '2026-10-05T07:30:00.000Z' }, 'squat', 'top', 95);
    const deviceClockAhead = Date.parse('2026-10-05T09:00:00.000Z');
    const beforeSync = fetched(emptyProgramFactsCache(ENROLLMENT_ID), Date.parse('2026-10-05T08:00:00.000Z'), [
      reference,
    ]);
    const synced = appendFinishedSession(beforeSync, mondayDraft(), linkedSync(MONDAY_COMPLETED_AT), deviceClockAhead);
    const refetched = fetched(synced, deviceClockAhead + 1_000, [serverMonday(), reference]);

    const orderBefore = orderFacts(cachedProgramFacts(synced)).map((fact) => fact.id);
    const orderAfter = orderFacts(cachedProgramFacts(refetched)).map((fact) => fact.id);

    expect(orderBefore).toEqual([MONDAY_SESSION_ID, 'event-1']);
    expect(orderAfter).toEqual(orderBefore);
    const stateBefore = programStateAt(MADCOW_5X5, madcow, cachedProgramFacts(synced));
    const stateAfter = programStateAt(MADCOW_5X5, madcow, cachedProgramFacts(refetched));
    expect(stateAfter.position).toEqual(stateBefore.position);
    expect(stateAfter.refs).toEqual(stateBefore.refs);
  });
});

describe('syncedSessionFact mirrors what the server stores', () => {
  function draftWithSquatSets(sets: DraftSet[]): WorkoutDraft {
    const draft = mondayDraft();
    const [squat, ...rest] = draft.exercises;
    return { ...draft, exercises: [{ ...squat, sets } as typeof squat, ...rest] };
  }

  it('rounds the logged weight to 2 decimals and drops a 2500 kg snapshot, as the server fact would read', () => {
    const draft = draftWithSquatSets([
      draftSet('squat-0', 100.005, 5, {
        effort: { type: 'rir', value: 2 },
        prescription: snapshot('mon-squat:0', { weightKg: 2500, reps: 5 }),
      }),
    ]);
    expect(syncedSessionFact(draft, MONDAY_COMPLETED_AT)?.sets).toEqual([
      { exerciseId: 'squat', weightKg: 100.01, reps: 5, effortInputType: 'rir', effortValue: 2, prescription: null },
    ]);
  });

  it('rounds the snapshot weight to 2 decimals', () => {
    const draft = draftWithSquatSets([
      draftSet('squat-0', 70, 5, { prescription: snapshot('mon-squat:0', { weightKg: 70.006, reps: 5 }) }),
    ]);
    expect(syncedSessionFact(draft, MONDAY_COMPLETED_AT)?.sets[0].prescription).toEqual(
      snapshot('mon-squat:0', { weightKg: 70.01, reps: 5 }),
    );
  });

  it.each([
    ['a negative weight', snapshot('mon-squat:0', { weightKg: -5, reps: 5 })],
    ['zero reps', snapshot('mon-squat:0', { weightKg: 70, reps: 0 })],
    ['101 reps', snapshot('mon-squat:0', { weightKg: 70, reps: 101 })],
    ['fractional reps', snapshot('mon-squat:0', { weightKg: 70, reps: 4.5 })],
    ['negative minimum reps', snapshot('mon-squat:0', { weightKg: 70, reps: 5, minReps: -1 })],
    ['minimum reps above the reps', snapshot('mon-squat:0', { weightKg: 70, reps: 5, minReps: 6 })],
    ['an empty ref', snapshot('', { weightKg: 70, reps: 5 })],
    ['a ref longer than 100 characters', snapshot('x'.repeat(101), { weightKg: 70, reps: 5 })],
    ['a NUL character in the ref', snapshot('mon-squat:\u00000', { weightKg: 70, reps: 5 })],
  ])('drops a snapshot with %s, as the server does', (_, prescription) => {
    const draft = draftWithSquatSets([draftSet('squat-0', 70, 5, { prescription })]);
    expect(syncedSessionFact(draft, MONDAY_COMPLETED_AT)?.sets[0].prescription).toBeNull();
  });

  it('keeps the snapshot of the first done set per ref and drops it from later ones, as the server does', () => {
    const draft = draftWithSquatSets([
      draftSet('squat-a', 60, 5, { prescription: snapshot('mon-squat:0', { weightKg: 60, reps: 5 }) }),
      draftSet('squat-b', 65, 5, { prescription: snapshot('mon-squat:0', { weightKg: 65, reps: 5 }) }),
    ]);
    expect(
      syncedSessionFact(draft, MONDAY_COMPLETED_AT)?.sets.map((set) => set.prescription?.weightKg ?? null),
    ).toEqual([60, null]);
  });
});

describe('program facts cache fetch boundary', () => {
  it('keeps an append made at the very instant the refetch started when the snapshot does not list it', () => {
    const refetched = fetched(syncedMonday(2_000), 2_000, []);
    expect(idsOf(refetched)).toEqual([MONDAY_SESSION_ID]);
  });
});

describe('fold order of facts at one instant', () => {
  it('orders an event and a session that share a millisecond by id, whatever the input order', () => {
    const reference = setReferenceFact({ id: 'event-1', at: '2026-10-05T07:00:00.000456Z' }, 'squat', 'top', 95);
    const monday = sessionFact({ id: MONDAY_SESSION_ID, at: '2026-10-05T07:00:00.000Z' }, weekDay(1, 'mon'), [
      ...madcowDaySets('mon'),
    ]);
    expect(orderFacts([reference, monday]).map((fact) => fact.id)).toEqual(['event-1', MONDAY_SESSION_ID]);
    expect(orderFacts([monday, reference]).map((fact) => fact.id)).toEqual(['event-1', MONDAY_SESSION_ID]);
    expect(programStateAt(MADCOW_5X5, madcow, [monday, reference])).toEqual(
      programStateAt(MADCOW_5X5, madcow, [reference, monday]),
    );
  });
});
