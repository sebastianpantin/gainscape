import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStorage } from './memory-storage.ts';

const server = vi.hoisted(() => ({
  tables: {} as Record<string, unknown[] | { error: { message: string } }>,
  rpcCalls: [] as string[],
  rpcArgs: [] as unknown[],
}));

vi.mock('../../web/src/lib/platform/supabase.ts', () => {
  function query(table: string) {
    let single = false;
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'is', 'order', 'limit', 'abortSignal', 'retry'])
      builder[method] = () => builder;
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
      rpc: (name: string, args: unknown) => {
        server.rpcCalls.push(name);
        server.rpcArgs.push(args);
        return Promise.resolve({ data: null, error: null });
      },
    },
  };
});

const { loadProfileCacheFirst, fetchProfile } = await import('../../web/src/lib/profile/profile.ts');
const { fetchPrograms, deleteProgram, saveProgram } = await import('../../web/src/lib/programs/programs.ts');
const { loadStanding } = await import('../../web/src/lib/progress/standing-data.ts');
const { loadCollectionCacheFirst } = await import('../../web/src/lib/collection/collection-data.ts');
const { profileCache } = await import('../../web/src/offline/profile-cache.ts');
const { programListCache } = await import('../../web/src/offline/program-list-cache.ts');
const { standingCache } = await import('../../web/src/offline/standing-cache.ts');
const { collectionCache } = await import('../../web/src/offline/collection-cache.ts');
const { loadItemsCacheFirst } = await import('../../web/src/lib/collection/items.ts');
const { loadProgramTemplatesCacheFirst } = await import('../../web/src/lib/programs/program-enrollment.ts');
const { readItemsCache, saveItemsCache } = await import('../../web/src/offline/items-cache.ts');
const { readProgramCache } = await import('../../web/src/offline/program-cache.ts');
const { loadQuestsCacheFirst } = await import('../../web/src/lib/quests/quests.ts');
const { questsCache } = await import('../../web/src/offline/quests-cache.ts');

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
  sex: 'female',
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
          {
            position: 0,
            exercise_id: 'bench',
            target_sets: 3,
            target_reps_min: 5,
            target_reps_max: 8,
            progression: 'none',
            increment_kg: null,
            increment_lb: null,
          },
          {
            position: 1,
            exercise_id: 'squat',
            target_sets: 5,
            target_reps_min: 5,
            target_reps_max: 5,
            progression: 'linear',
            increment_kg: 2.5,
            increment_lb: 5,
          },
          {
            position: 2,
            exercise_id: 'press',
            target_sets: 3,
            target_reps_min: 5,
            target_reps_max: 5,
            progression: 'fixed',
            increment_kg: null,
            increment_lb: null,
          },
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
    tracks_distance: true,
    exercise_skills: [],
  };
}

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  server.tables = {};
  server.rpcCalls = [];
  server.rpcArgs = [];
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
    expect(load.loaded.sex).toBe('female');
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

  it('reads the progression of each planned exercise', async () => {
    server.tables = { programs: [programRow('a', 'A plan')] };
    const [program] = await fetchPrograms(USER_ID);
    expect(program.days[0].exercises.map((planned) => planned.progression)).toEqual([
      { kind: 'none' },
      { kind: 'linear', incrementKg: 2.5, incrementLb: 5 },
      { kind: 'fixed' },
    ]);
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
      rep_maxes: [
        {
          exercise_id: 'old-press',
          reps: 5,
          load_kg: '60',
          exact_set_id: 'set-1',
          achieved_at: '2026-10-01T10:00:00Z',
        },
      ],
    };
    await loadCollectionCacheFirst(USER_ID);
    const saved = collectionCache.read(storage, USER_ID);
    expect(saved?.exercises.map((exercise) => [exercise.id, exercise.archived])).toEqual([
      ['bench', false],
      ['old-press', true],
    ]);
    expect(saved?.rows.repMaxes).toEqual([
      { exercise_id: 'old-press', reps: 5, load_kg: '60', exact_set_id: 'set-1', achieved_at: '2026-10-01T10:00:00Z' },
    ]);
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
      drop_luck: [{ dry_rolls: 4, drop_tables: { key: 'regular' } }],
    };
    const load = await loadItemsCacheFirst(USER_ID);
    expect(load.fromCache).toBe(false);
    expect(readItemsCache(storage, USER_ID)?.inventory).toEqual([
      { itemId: 'belt-1', quantity: 1, firstObtainedAt: '2026-10-09T10:00:00.000Z' },
    ]);
    expect(load.loaded.held.get('belt-1')?.quantity).toBe(1);
    expect(load.loaded.strength).toBeNull();
    expect(load.loaded.dryRolls).toBe(4);
    expect(readItemsCache(storage, USER_ID)?.dryRolls).toBe(4);
  });

  it('keeps the saved dry rolls when the luck load fails', async () => {
    saveItemsCache(storage, USER_ID, {
      catalog: { items: [], recipes: [], challenges: [] },
      inventory: [],
      strength: {},
      strengthAsOf: '2026-10-09T10:00:00.000Z',
      challengeExercises: [],
      dryRolls: 6,
    });
    server.tables = { drop_luck: { error: { message: 'down' } } };
    const load = await loadItemsCacheFirst(USER_ID);
    expect(load.loaded.dryRolls).toBe(6);
  });

  it('saves the program templates to the program cache', async () => {
    vi.stubGlobal('localStorage', storage);
    const template = { key: 'starter', version: 1, name: 'Starter', definition: {} };
    server.tables = { program_templates: [template] };
    expect(await loadProgramTemplatesCacheFirst(USER_ID)).toEqual([template]);
    expect(readProgramCache(storage, USER_ID).templates).toEqual([template]);
  });
});

describe('saving the quest log after an online load', () => {
  const quest = {
    id: 'quest-1',
    key: 'x_marks_the_squat',
    name: 'X Marks the Squat',
    description: 'Squat twice.',
    quest_points: 1,
    sort_order: 1,
    retired_at: null,
    definition: {
      steps: [{ kind: 'sessions', target: 2, exerciseId: 'squat' }],
      rewardXp: { 'skill-legs': 800 },
      requiredLevels: [],
      requiredQuestIds: [],
    },
  };

  it('saves the quests, your progress and the names of the exercises their steps name', async () => {
    server.tables = {
      quests: [quest],
      quest_progress: [
        { quest_id: 'quest-1', started_at: '2026-10-10T10:00:00.000Z', step_index: 0, step_progress: '1.00' },
      ],
      quest_completions: [],
      exercises: [{ id: 'squat', name: 'Back Squat' }],
    };
    const load = await loadQuestsCacheFirst(USER_ID);
    expect(load.fromCache).toBe(false);
    expect(load.loaded.progress).toEqual([
      { questId: 'quest-1', startedAt: '2026-10-10T10:00:00.000Z', stepIndex: 0, stepProgress: 1 },
    ]);
    expect(questsCache.read(storage, USER_ID)).toMatchObject({
      quests: [quest],
      exerciseNames: { squat: 'Back Squat' },
    });
  });

  it('shows the saved quest log when the device is offline', async () => {
    questsCache.save(storage, USER_ID, { quests: [quest], progress: [], completions: [], exerciseNames: {} });
    vi.stubGlobal('navigator', { onLine: false });
    const load = await loadQuestsCacheFirst(USER_ID);
    expect(load).toMatchObject({ fromCache: true, offline: true });
    expect(load.loaded.quests.map((saved) => saved.name)).toEqual(['X Marks the Squat']);
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

  it('sends the progression of each planned exercise as flat fields', async () => {
    const planned = { targetSets: 5, targetRepsMin: 5, targetRepsMax: 5 };
    await saveProgram(USER_ID, {
      id: 'b',
      name: 'B plan',
      days: [
        {
          id: 'b-day',
          name: 'Upper',
          exercises: [
            { exerciseId: 'bench', ...planned, progression: { kind: 'none' } },
            { exerciseId: 'squat', ...planned, progression: { kind: 'linear', incrementKg: 2.5, incrementLb: 5 } },
            { exerciseId: 'press', ...planned, progression: { kind: 'fixed' } },
          ],
        },
      ],
    });
    expect(server.rpcArgs).toEqual([
      {
        program: {
          id: 'b',
          name: 'B plan',
          days: [
            {
              id: 'b-day',
              name: 'Upper',
              exercises: [
                { exerciseId: 'bench', ...planned, progression: 'none', incrementKg: null, incrementLb: null },
                { exerciseId: 'squat', ...planned, progression: 'linear', incrementKg: 2.5, incrementLb: 5 },
                { exerciseId: 'press', ...planned, progression: 'fixed', incrementKg: null, incrementLb: null },
              ],
            },
          ],
        },
      },
    ]);
  });
});
