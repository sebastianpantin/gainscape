import { describe, expect, it } from 'vitest';
import { type ProgramTemplateRow } from '../../web/src/lib/programs/program-enroll-rules.ts';
import {
  type EnrollmentFactsRows,
  type EnrollmentRow,
  type LinkedSessionRow,
} from '../../web/src/lib/programs/program-facts-rules.ts';
import {
  forgetDeletedProgramSession,
  type ProgramCache,
  readProgramCache,
  saveProgramCache,
  withEnrollment,
} from '../../web/src/offline/program-cache.ts';
import { emptyProgramFactsCache } from '../../web/src/offline/program-facts-cache.ts';
import {
  type ProgramFetchers,
  type ProgramRefreshContext,
  refreshProgramCacheWith,
  refreshProgramFactsWith,
} from '../../web/src/offline/program-refresh.ts';
import { MADCOW_5X5, MADCOW_EXERCISES } from '../domain/program-fixtures/madcow_5x5.ts';
import { MemoryStorage } from './memory-storage.ts';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const FIRST_ID = '7a2f0c1e-1111-4111-8111-111111111111';
const SECOND_ID = '7a2f0c1e-2222-4222-8222-222222222222';
const THIRD_ID = '7a2f0c1e-3333-4333-8333-333333333333';

const MADCOW_TEMPLATE: ProgramTemplateRow = {
  key: 'madcow_5x5',
  version: 1,
  name: 'Madcow 5x5',
  definition: MADCOW_5X5,
};

function enrollmentRow(id: string): EnrollmentRow {
  return {
    id,
    template_key: 'madcow_5x5',
    template_version: 1,
    unit: 'kg',
    options: { rampStep: 0.125 },
    lift_bindings: { ...MADCOW_EXERCISES },
    inputs: {
      squat: { fiveRm: 100 },
      bench: { fiveRm: 80 },
      row: { fiveRm: 70 },
      press: { fiveRm: 50 },
      deadlift: { fiveRm: 140 },
    },
    rounding: { increment: 2.5, mode: 'nearest', barWeight: 20 },
    started_at: '2026-10-04T18:00:00.000Z',
    ended_at: null,
  };
}

function sessionRow(id: string, completedAt: string): LinkedSessionRow {
  return {
    id,
    completed_at: completedAt,
    program_position: { week: 1, day: 'mon' },
    sets: [
      {
        ref: 'mon-squat:0',
        exercise_id: MADCOW_EXERCISES.squat,
        weight_kg: 47.5,
        reps: 5,
        effort_input_type: null,
        effort_value: null,
        prescribed_weight_kg: 47.5,
        prescribed_reps: 5,
        prescribed_min_reps: null,
        prescribed_amrap: false,
      },
    ],
  };
}

function factsRows(enrollment: EnrollmentRow, sessions: LinkedSessionRow[]): EnrollmentFactsRows {
  return { enrollment, events: [], sessions };
}

const MONDAY = sessionRow('session-monday', '2026-10-05T07:00:00.000Z');
const WEDNESDAY = sessionRow('session-wednesday', '2026-10-07T07:00:00.000Z');

interface Harness {
  context: ProgramRefreshContext;
  storage: MemoryStorage;
  factsRequests: string[];
}

function harness(fetchers: Partial<ProgramFetchers> & Pick<ProgramFetchers, 'enrollmentFacts'>): Harness {
  const storage = new MemoryStorage();
  const factsRequests: string[] = [];
  const context: ProgramRefreshContext = {
    storage,
    userId: USER_ID,
    now: () => 1_000,
    fetchers: {
      templates: async () => [MADCOW_TEMPLATE],
      activeEnrollment: async () => enrollmentRow(FIRST_ID),
      ...fetchers,
      enrollmentFacts: (enrollmentId) => {
        factsRequests.push(enrollmentId);
        return fetchers.enrollmentFacts(enrollmentId);
      },
    },
  };
  return { context, storage, factsRequests };
}

function cachedFor(storage: Storage): ProgramCache {
  return readProgramCache(storage, USER_ID);
}

function serverIds(cache: ProgramCache): string[] {
  return (cache.facts?.serverFacts ?? []).map((fact) => fact.id);
}

describe('refreshing the program facts', () => {
  it('merges the fetched sessions into the cache for the enrollment', async () => {
    const { context } = harness({ enrollmentFacts: async () => factsRows(enrollmentRow(FIRST_ID), [MONDAY]) });
    const refreshed = await refreshProgramFactsWith(context, enrollmentRow(FIRST_ID));
    expect(refreshed.facts?.enrollmentId).toBe(FIRST_ID);
    expect(serverIds(refreshed)).toEqual(['session-monday']);
  });

  it('saves the new enrollment before fetching, so a fetch for a new enrollment id is merged, not discarded', async () => {
    let enrollmentDuringFetch: string | null | undefined;
    const { context, storage } = harness({
      enrollmentFacts: async () => {
        enrollmentDuringFetch = cachedFor(storage).enrollment?.id;
        return factsRows(enrollmentRow(SECOND_ID), [MONDAY]);
      },
    });
    saveProgramCache(
      storage,
      USER_ID,
      withEnrollment({ templates: [MADCOW_TEMPLATE], enrollment: null, facts: null }, enrollmentRow(FIRST_ID)),
    );
    const refreshed = await refreshProgramFactsWith(context, enrollmentRow(SECOND_ID));
    expect(enrollmentDuringFetch).toBe(SECOND_ID);
    expect(refreshed.facts?.enrollmentId).toBe(SECOND_ID);
    expect(serverIds(refreshed)).toEqual(['session-monday']);
  });

  it('discards the merge when a session was deleted during the fetch, so the deleted session does not come back', async () => {
    const { context, storage } = harness({
      enrollmentFacts: async () => {
        forgetDeletedProgramSession(storage, USER_ID, 'session-monday');
        return factsRows(enrollmentRow(FIRST_ID), [MONDAY, WEDNESDAY]);
      },
    });
    const start = withEnrollment(
      { templates: [MADCOW_TEMPLATE], enrollment: null, facts: null },
      enrollmentRow(FIRST_ID),
    );
    const seeded: ProgramCache = {
      ...start,
      facts: {
        ...emptyProgramFactsCache(FIRST_ID),
        serverFacts: [
          {
            kind: 'session',
            id: 'session-monday',
            at: MONDAY.completed_at,
            position: { week: 1, day: 'mon' },
            sets: [],
          },
        ],
      },
    };
    saveProgramCache(storage, USER_ID, seeded);
    const refreshed = await refreshProgramFactsWith(context, enrollmentRow(FIRST_ID));
    expect(serverIds(refreshed)).not.toContain('session-monday');
    expect(serverIds(cachedFor(storage))).not.toContain('session-monday');
  });

  it('discards the merge when another enrollment started during the fetch', async () => {
    const { context, storage } = harness({
      enrollmentFacts: async () => {
        saveProgramCache(storage, USER_ID, withEnrollment(cachedFor(storage), enrollmentRow(THIRD_ID)));
        return factsRows(enrollmentRow(FIRST_ID), [MONDAY]);
      },
    });
    const refreshed = await refreshProgramFactsWith(context, enrollmentRow(FIRST_ID));
    expect(refreshed.enrollment?.id).toBe(THIRD_ID);
    expect(refreshed.facts?.enrollmentId).toBe(THIRD_ID);
    expect(serverIds(refreshed)).toEqual([]);
  });
});

describe('refreshing the whole program cache', () => {
  it('marks the cache as refreshed once a refresh has run, even when no enrollment is active', async () => {
    const { context, storage } = harness({
      activeEnrollment: async () => null,
      enrollmentFacts: async () => factsRows(enrollmentRow(FIRST_ID), []),
    });
    expect(cachedFor(storage).refreshed).toBeUndefined();
    await refreshProgramCacheWith(context);
    expect(cachedFor(storage).refreshed).toBe(true);
  });

  it('stores the fetched templates, the active enrollment and its facts', async () => {
    const { context, storage } = harness({ enrollmentFacts: async () => factsRows(enrollmentRow(FIRST_ID), [MONDAY]) });
    await refreshProgramCacheWith(context);
    const cached = cachedFor(storage);
    expect(cached.templates).toEqual([MADCOW_TEMPLATE]);
    expect(cached.enrollment?.id).toBe(FIRST_ID);
    expect(serverIds(cached)).toEqual(['session-monday']);
  });

  it('clears the enrollment and its facts when it was ended on another device, without fetching facts', async () => {
    const { context, storage, factsRequests } = harness({
      activeEnrollment: async () => null,
      enrollmentFacts: async () => factsRows(enrollmentRow(FIRST_ID), [MONDAY]),
    });
    saveProgramCache(storage, USER_ID, {
      ...withEnrollment({ templates: [MADCOW_TEMPLATE], enrollment: null, facts: null }, enrollmentRow(FIRST_ID)),
    });
    const refreshed = await refreshProgramCacheWith(context);
    expect(refreshed.enrollment).toBeNull();
    expect(refreshed.facts).toBeNull();
    expect(cachedFor(storage)).toMatchObject({ enrollment: null, facts: null });
    expect(factsRequests).toEqual([]);
  });

  it('keeps the cached program when a fetch fails', async () => {
    const { context, storage } = harness({
      templates: async () => {
        throw new TypeError('Failed to fetch');
      },
      enrollmentFacts: async () => factsRows(enrollmentRow(FIRST_ID), [MONDAY]),
    });
    const before: ProgramCache = withEnrollment(
      { templates: [MADCOW_TEMPLATE], enrollment: null, facts: null },
      enrollmentRow(FIRST_ID),
    );
    saveProgramCache(storage, USER_ID, before);
    await expect(refreshProgramCacheWith(context)).rejects.toThrow('Failed to fetch');
    expect(cachedFor(storage)).toEqual(before);
  });
});
