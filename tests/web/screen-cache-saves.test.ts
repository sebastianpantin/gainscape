import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStorage } from './memory-storage.ts';

const server = vi.hoisted(() => ({
  tables: {} as Record<string, unknown[] | { error: { message: string } }>,
  rpcCalls: [] as string[],
}));

vi.mock('../../web/src/lib/supabase.ts', () => {
  function query(table: string) {
    let single = false;
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'is', 'order', 'limit', 'abortSignal']) builder[method] = () => builder;
    builder.single = () => {
      single = true;
      return builder;
    };
    builder.maybeSingle = builder.single;
    builder.then = (resolve: (result: unknown) => unknown) => {
      const answer = server.tables[table] ?? [];
      if (!Array.isArray(answer)) return Promise.resolve(resolve({ data: null, error: answer.error }));
      return Promise.resolve(resolve({ data: single ? (answer[0] ?? null) : answer, error: null }));
    };
    return builder;
  }
  return {
    supabase: {
      from: query,
      rpc: (name: string) => {
        server.rpcCalls.push(name);
        return Promise.resolve({ data: null, error: null });
      },
    },
  };
});

const { loadProfileCacheFirst, fetchProfile } = await import('../../web/src/lib/profile.ts');
const { fetchPrograms, deleteProgram, saveProgram } = await import('../../web/src/lib/programs.ts');
const { loadStanding } = await import('../../web/src/lib/standing.ts');
const { loadCollectionCacheFirst } = await import('../../web/src/lib/collection-data.ts');
const { profileCache } = await import('../../web/src/offline/profile-cache.ts');
const { programListCache } = await import('../../web/src/offline/program-list-cache.ts');
const { standingCache } = await import('../../web/src/offline/standing-cache.ts');
const { collectionCache } = await import('../../web/src/offline/collection-cache.ts');
const { loadItemsCacheFirst } = await import('../../web/src/lib/items.ts');
const { loadProgramTemplatesCacheFirst } = await import('../../web/src/lib/program-enrollment.ts');
const { readItemsCache } = await import('../../web/src/offline/items-cache.ts');
const { readProgramCache } = await import('../../web/src/offline/program-cache.ts');

const USER_ID = '11111111-1111-4111-8111-111111111111';

const PROFILE_ROW = {
  username: 'lifter',
  display_name: 'Lifter',
  bio: null,
  training_focus: null,
  training_since: null,
  badge_color: 'gold',
  show_weights: true,
  show_bodyweight: false,
  created_at: '2026-10-01T08:00:00.000Z',
};

const PRIVATE_ROW = {
  bodyweight_kg: '82.5',
  height_cm: null,
  birth_year: null,
  unit_pref: 'kg',
  effort_input_mode: 'level',
  timezone: 'UTC',
  timezone_changed_at: null,
};

function programRow(id: string, name: string) {
  return {
    id,
    key: null,
    name,
    owner_user_id: USER_ID,
    copied_from_id: null,
    program_days: [
      {
        id: `${id}-day`,
        name: 'Upper',
        position: 0,
        program_day_exercises: [
          { position: 0, exercise_id: 'bench', target_sets: 3, target_reps_min: 5, target_reps_max: 8 },
        ],
      },
    ],
  };
}

function exerciseRow(id: string, archivedAt: string | null) {
  return {
    id,
    key: id,
    name: id,
    equipment: 'barbell',
    modality: 'lift',
    load_type: 'external',
    owner_user_id: archivedAt ? USER_ID : null,
    archived_at: archivedAt,
    reference_pace_s_per_km: null,
    pace_unit: null,
    max_effort: null,
    exercise_skills: [],
  };
}

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  server.tables = {};
  server.rpcCalls = [];
  vi.stubGlobal('window', {
    localStorage: storage,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('saving screen caches after an online load', () => {
  it('saves the profile when the profile screen loads online', async () => {
    server.tables = { profiles: [PROFILE_ROW], profile_private: [PRIVATE_ROW] };
    const load = await loadProfileCacheFirst(USER_ID);
    expect(load.fromCache).toBe(false);
    expect(profileCache.read(storage, USER_ID)).toEqual(load.loaded);
    expect(profileCache.read(storage, USER_ID)?.bodyweightKg).toBe(82.5);
  });

  it('keeps the saved profile when the load was cancelled, so an older answer cannot replace a newer edit', async () => {
    server.tables = { profiles: [PROFILE_ROW], profile_private: [PRIVATE_ROW] };
    const cancelled = new AbortController();
    cancelled.abort();
    await loadProfileCacheFirst(USER_ID, cancelled.signal);
    await fetchProfile(USER_ID);
    expect(profileCache.read(storage, USER_ID)).toBeNull();
  });

  it('saves the program list after fetching it', async () => {
    server.tables = { programs: [programRow('b', 'B plan'), programRow('a', 'A plan')] };
    const programs = await fetchPrograms(USER_ID);
    expect(programs.map((program) => program.name)).toEqual(['A plan', 'B plan']);
    expect(programListCache.read(storage, USER_ID)).toEqual(programs);
  });

  it('saves the skills and their XP when the standing loads online', async () => {
    server.tables = {
      skills: [{ id: 'skill-chest', key: 'chest', name: 'Chest', sort_order: 1, combat_weight: '1', modality: 'lift' }],
      user_skills: [{ skill_id: 'skill-chest', xp: '1250' }],
    };
    await loadStanding(USER_ID);
    expect(standingCache.read(storage, USER_ID)).toEqual({
      skills: [{ id: 'skill-chest', key: 'chest', name: 'Chest', sortOrder: 1, combatWeight: 1, modality: 'lift' }],
      xpBySkillId: { 'skill-chest': 1250 },
    });
  });

  it('saves the collection rows with the full exercise list, archived exercises included', async () => {
    server.tables = {
      exercises: [exerciseRow('bench', null), exerciseRow('old-press', '2026-09-01T00:00:00Z')],
      rep_maxes: [{ exercise_id: 'old-press', reps: 5, load_kg: '60', exact_set_id: 'set-1' }],
    };
    await loadCollectionCacheFirst(USER_ID);
    const saved = collectionCache.read(storage, USER_ID);
    expect(saved?.exercises.map((exercise) => [exercise.id, exercise.archived])).toEqual([
      ['bench', false],
      ['old-press', true],
    ]);
    expect(saved?.rows.repMaxes).toEqual([{ exercise_id: 'old-press', reps: 5, load_kg: '60', exact_set_id: 'set-1' }]);
  });
});

describe('saving the items and program templates after an online load', () => {
  it('saves the items with the inventory and the challenge exercises', async () => {
    server.tables = {
      items: [
        {
          id: 'belt-1',
          key: 'rookie_belt',
          name: 'Rookie belt',
          kind: 'gear',
          rarity: 'common',
          tier: 'rookie',
          gear_slot: 'belt',
          icon_key: 'belt',
          description: '',
          grants_challenge_id: null,
          sort_order: 1,
        },
      ],
      user_items: [{ item_id: 'belt-1', quantity: 1, first_obtained_at: '2026-10-09T10:00:00.000Z' }],
      exercises: [exerciseRow('bench', null)],
    };
    const load = await loadItemsCacheFirst(USER_ID);
    expect(load.fromCache).toBe(false);
    expect(readItemsCache(storage, USER_ID)?.inventory).toEqual([
      { itemId: 'belt-1', quantity: 1, firstObtainedAt: '2026-10-09T10:00:00.000Z' },
    ]);
    expect(load.loaded.held.get('belt-1')?.quantity).toBe(1);
    expect(load.loaded.strength).toBeNull();
  });

  it('saves the program templates to the program cache', async () => {
    vi.stubGlobal('localStorage', storage);
    const template = { key: 'starter', version: 1, name: 'Starter', definition: {} };
    server.tables = { program_templates: [template] };
    expect(await loadProgramTemplatesCacheFirst(USER_ID)).toEqual([template]);
    expect(readProgramCache(storage, USER_ID).templates).toEqual([template]);
  });
});

describe('keeping the saved program list right after a change when the refresh fails', () => {
  beforeEach(async () => {
    server.tables = { programs: [programRow('a', 'A plan'), programRow('b', 'B plan')] };
    await fetchPrograms(USER_ID);
    server.tables = { programs: { error: { message: 'Failed to fetch' } } };
  });

  it('drops a deleted program from the saved list', async () => {
    await deleteProgram(USER_ID, 'a');
    expect(server.rpcCalls).toEqual(['delete_program']);
    expect(programListCache.read(storage, USER_ID)?.map((program) => program.id)).toEqual(['b']);
  });

  it('stores a saved program under its new name and days', async () => {
    await saveProgram(USER_ID, {
      id: 'b',
      name: 'B renamed',
      days: [{ id: 'b-day-2', name: 'Lower', exercises: [] }],
    });
    const saved = programListCache.read(storage, USER_ID)?.find((program) => program.id === 'b');
    expect(saved).toMatchObject({
      name: 'B renamed',
      days: [{ id: 'b-day-2', name: 'Lower', position: 0, exercises: [] }],
    });
  });
});
