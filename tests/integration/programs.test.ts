import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  builtInExerciseId,
  createTestUser,
  db,
  postCompleteSession,
  rateLimitHits,
  type TestUser,
} from './local-stack.ts';
import { aSet, hoursAgo, payloadAt } from './session-support.ts';

const templateContents = {
  ppl: {
    name: 'Push / Pull / Legs',
    days: [
      [
        'Push',
        [
          'barbell_bench_press 4x6-10',
          'overhead_press 3x6-10',
          'incline_dumbbell_press 3x8-12',
          'lateral_raise 3x12-15',
          'cable_triceps_pushdown 3x10-15',
        ],
      ],
      [
        'Pull',
        [
          'barbell_row 4x6-10',
          'lat_pulldown 3x8-12',
          'seated_cable_row 3x8-12',
          'face_pull 3x12-15',
          'barbell_curl 3x8-12',
        ],
      ],
      [
        'Legs',
        [
          'back_squat 4x5-8',
          'romanian_deadlift 3x6-10',
          'leg_press 3x10-15',
          'leg_curl 3x10-15',
          'standing_calf_raise 3x10-15',
        ],
      ],
    ],
  },
  upper_lower: {
    name: 'Upper / Lower',
    days: [
      [
        'Upper',
        [
          'barbell_bench_press 4x6-10',
          'barbell_row 4x6-10',
          'overhead_press 3x6-10',
          'lat_pulldown 3x8-12',
          'barbell_curl 2x8-12',
          'cable_triceps_pushdown 2x10-15',
        ],
      ],
      [
        'Lower',
        [
          'back_squat 4x5-8',
          'romanian_deadlift 3x6-10',
          'leg_press 3x10-15',
          'leg_curl 3x10-15',
          'standing_calf_raise 3x10-15',
          'cable_crunch 3x10-15',
        ],
      ],
    ],
  },
  full_body_2x: {
    name: 'Full Body 2x',
    days: [
      [
        'Day A',
        [
          'back_squat 3x5-8',
          'barbell_bench_press 3x6-10',
          'barbell_row 3x6-10',
          'lateral_raise 2x12-15',
          'cable_crunch 2x10-15',
        ],
      ],
      [
        'Day B',
        ['deadlift 3x3-6', 'overhead_press 3x6-10', 'pull_up 3x5-10', 'leg_press 3x10-15', 'hanging_leg_raise 2x8-12'],
      ],
    ],
  },
};

interface PlannedExerciseDoc {
  exerciseId: string;
  targetSets: number;
  targetRepsMin: number;
  targetRepsMax: number;
}

interface ProgramDoc {
  id: string;
  name: string;
  days: { id: string; name: string; exercises: PlannedExerciseDoc[] }[];
}

let templateIds: Record<string, string>;
let benchId: string;
let squatId: string;

beforeAll(async () => {
  const rows = await db`select id, key from public.programs where owner_user_id is null`;
  templateIds = Object.fromEntries(rows.map((row) => [row.key, row.id]));
  benchId = await builtInExerciseId('barbell_bench_press');
  squatId = await builtInExerciseId('back_squat');
});

afterAll(async () => {
  await db.end();
});

async function programDoc(programId: string): Promise<ProgramDoc> {
  const [program] = await db`select id, name from public.programs where id = ${programId}`;
  const days = await db`select id, name from public.program_days where program_id = ${programId} order by position`;
  return {
    id: program.id,
    name: program.name,
    days: await Promise.all(
      days.map(async (day) => ({
        id: day.id,
        name: day.name,
        exercises: (
          await db`select exercise_id, target_sets, target_reps_min, target_reps_max
                   from public.program_day_exercises where day_id = ${day.id} order by position`
        ).map((row) => ({
          exerciseId: row.exercise_id,
          targetSets: row.target_sets,
          targetRepsMin: row.target_reps_min,
          targetRepsMax: row.target_reps_max,
        })),
      })),
    ),
  };
}

async function programRowCounts(userId: string) {
  const [row] = await db`
    select
      (select count(*) from public.programs where owner_user_id = ${userId})::int as programs,
      (select count(*) from public.program_days d join public.programs p on p.id = d.program_id
        where p.owner_user_id = ${userId})::int as days,
      (select count(*) from public.program_day_exercises x join public.program_days d on d.id = x.day_id
        join public.programs p on p.id = d.program_id where p.owner_user_id = ${userId})::int as exercises`;
  return row;
}

async function copyTemplate(user: TestUser, key = 'upper_lower'): Promise<string> {
  const newId = randomUUID();
  const { data, error } = await user.client.rpc('copy_program', {
    source_program_id: templateIds[key],
    new_program_id: newId,
  });
  expect(error).toBeNull();
  expect(data).toBe(newId);
  return newId;
}

function simpleProgram(overrides: Partial<ProgramDoc> = {}): ProgramDoc {
  return {
    id: randomUUID(),
    name: 'Simple',
    days: [
      {
        id: randomUUID(),
        name: 'Only day',
        exercises: [{ exerciseId: benchId, targetSets: 3, targetRepsMin: 8, targetRepsMax: 12 }],
      },
    ],
    ...overrides,
  };
}

async function saveProgram(user: TestUser, program: unknown) {
  return user.client.rpc('save_program', { program });
}

function finishedSession(programDayId: unknown, exerciseId = benchId) {
  return { ...payloadAt(hoursAgo(1), [aSet(exerciseId, 0, 60, { reps: 8 })]), programDayId };
}

async function storedProgramDayId(sessionId: string): Promise<string | null> {
  const [row] = await db`select program_day_id from public.sessions where id = ${sessionId}`;
  return row.program_day_id;
}

interface TemplateRow {
  key: string;
  name: string;
  program_days: {
    name: string;
    position: number;
    program_day_exercises: {
      position: number;
      target_sets: number;
      target_reps_min: number;
      target_reps_max: number;
      exercises: { key: string; owner_user_id: string | null; archived_at: string | null };
    }[];
  }[];
}

describe('program templates', () => {
  it('seeds exactly the three tabled templates, readable by any user', async () => {
    const user = await createTestUser();
    const { data, error } = await user.client
      .from('programs')
      .select(
        'key, name, owner_user_id, program_days(name, position, program_day_exercises(position, target_sets, target_reps_min, target_reps_max, exercises(key, owner_user_id, archived_at)))',
      )
      .is('owner_user_id', null);
    expect(error).toBeNull();
    const rows = data as unknown as TemplateRow[];
    const byKey = Object.fromEntries(
      rows.map((program) => [
        program.key,
        {
          name: program.name,
          days: [...program.program_days]
            .sort((a, b) => a.position - b.position)
            .map((day) => [
              day.name,
              [...day.program_day_exercises]
                .sort((a, b) => a.position - b.position)
                .map((x) => `${x.exercises.key} ${x.target_sets}x${x.target_reps_min}-${x.target_reps_max}`),
            ]),
        },
      ]),
    );
    expect(byKey).toEqual(templateContents);
    const exercises = rows.flatMap((program) =>
      program.program_days.flatMap((day) => day.program_day_exercises.map((x) => x.exercises)),
    );
    expect(exercises.every((exercise) => exercise.owner_user_id === null && exercise.archived_at === null)).toBe(true);
  });
});

describe('copy_program', () => {
  it('makes a deep copy with new day ids and copied_from_id, and a retry is a no-op', async () => {
    const user = await createTestUser();
    const copyId = await copyTemplate(user);
    const [copy] = await db`select owner_user_id, copied_from_id, key from public.programs where id = ${copyId}`;
    expect(copy).toEqual({ owner_user_id: user.id, copied_from_id: templateIds.upper_lower, key: null });

    const template = await programDoc(templateIds.upper_lower);
    const copied = await programDoc(copyId);
    expect(copied.days.map(({ name, exercises }) => ({ name, exercises }))).toEqual(
      template.days.map(({ name, exercises }) => ({ name, exercises })),
    );
    expect(copied.name).toBe(template.name);
    expect(copied.days.map((day) => day.id).some((id) => template.days.some((day) => day.id === id))).toBe(false);

    const before = await programRowCounts(user.id);
    const { data, error } = await user.client.rpc('copy_program', {
      source_program_id: templateIds.upper_lower,
      new_program_id: copyId,
    });
    expect(error).toBeNull();
    expect(data).toBe(copyId);
    expect(await programRowCounts(user.id)).toEqual(before);
  });

  it("refuses to copy another user's program", async () => {
    const [owner, stranger] = await Promise.all([createTestUser(), createTestUser()]);
    const ownerProgram = await copyTemplate(owner);
    const { error } = await stranger.client.rpc('copy_program', {
      source_program_id: ownerProgram,
      new_program_id: randomUUID(),
    });
    expect(error?.message).toBe('program_not_found');
    expect((await programRowCounts(stranger.id)).programs).toBe(0);
  });
});

describe('program save rate limit', () => {
  it('counts each copy and each edit once, however many rows the save touches', async () => {
    const user = await createTestUser();
    const programId = await copyTemplate(user, 'ppl');
    expect(await rateLimitHits('program_save_hour', user.id)).toBe(1);
    for (const name of ['One', 'Two', 'Three']) {
      const { error } = await saveProgram(user, { ...(await programDoc(programId)), name });
      expect(error).toBeNull();
    }
    expect(await rateLimitHits('program_save_hour', user.id)).toBe(4);
  });
});

describe('save_program', () => {
  it('renames, reorders and removes days while keeping the kept day ids', async () => {
    const user = await createTestUser();
    const programId = await copyTemplate(user, 'ppl');
    const original = await programDoc(programId);
    const [push, pull, legs] = original.days;
    const edited: ProgramDoc = { ...original, name: 'My PPL', days: [legs, push] };
    const { data, error } = await saveProgram(user, edited);
    expect(error).toBeNull();
    expect(data).toBe(programId);

    const saved = await programDoc(programId);
    expect(saved.name).toBe('My PPL');
    expect(saved.days.map((day) => day.id)).toEqual([legs.id, push.id]);
    expect(saved.days).toEqual([legs, push]);
    const [removed] = await db`select count(*)::int as count from public.program_days where id = ${pull.id}`;
    expect(removed.count).toBe(0);
  });

  describe('rejects invalid programs with row counts unchanged', () => {
    let user: TestUser;
    let stranger: TestUser;
    let strangerExerciseId: string;
    let programId: string;

    beforeAll(async () => {
      [user, stranger] = await Promise.all([createTestUser(), createTestUser()]);
      programId = await copyTemplate(user);
      strangerExerciseId = randomUUID();
      await db.begin(async (tx) => {
        await tx`insert into public.exercises (id, name, load_type, equipment, owner_user_id)
                 values (${strangerExerciseId}, 'Private Press', 'external', 'machine', ${stranger.id})`;
        await tx`insert into public.exercise_skills (exercise_id, skill_id, share_bp)
                 select ${strangerExerciseId}, id, 10000 from public.skills where key = 'chest'`;
      });
    });

    const planned = (overrides: Partial<PlannedExerciseDoc> = {}) => ({
      exerciseId: benchId,
      targetSets: 3,
      targetRepsMin: 8,
      targetRepsMax: 12,
      ...overrides,
    });
    const dayWith = (exercises: unknown[]) => ({ id: randomUUID(), name: 'Day', exercises });

    const cases: [string, () => unknown, string][] = [
      [
        'reps min above max',
        () => simpleProgram({ days: [dayWith([planned({ targetRepsMin: 12, targetRepsMax: 8 })])] as never }),
        'invalid_program',
      ],
      [
        '15 days',
        () => simpleProgram({ days: Array.from({ length: 15 }, () => dayWith([])) as never }),
        'invalid_program',
      ],
      [
        '21 exercises in a day',
        () => simpleProgram({ days: [dayWith(Array.from({ length: 21 }, () => planned()))] as never }),
        'invalid_program',
      ],
      [
        "another user's custom exercise",
        () => simpleProgram({ days: [dayWith([planned({ exerciseId: strangerExerciseId })])] as never }),
        'unknown_exercise',
      ],
      [
        'a random exercise id',
        () => simpleProgram({ days: [dayWith([planned({ exerciseId: randomUUID() })])] as never }),
        'unknown_exercise',
      ],
      ['days as an object', () => ({ ...simpleProgram(), days: {} }), 'invalid_program'],
      [
        'a string targetSets',
        () => simpleProgram({ days: [dayWith([{ ...planned(), targetSets: '3' }])] as never }),
        'invalid_program',
      ],
      ['a whitespace-only program name', () => simpleProgram({ name: '​ \t' }), 'invalid_program'],
    ];

    it.each(cases)('rejects %s', async (_label, build, code) => {
      const before = await programRowCounts(user.id);
      const { error } = await saveProgram(user, build());
      expect(error?.message).toBe(code);
      expect(await programRowCounts(user.id)).toEqual(before);
    });

    it('rejects day ids that differ only in case', async () => {
      const before = await programRowCounts(user.id);
      const dayId = randomUUID();
      const { error } = await saveProgram(
        user,
        simpleProgram({
          days: [
            { id: dayId.toLowerCase(), name: 'Lower case', exercises: [] },
            { id: dayId.toUpperCase(), name: 'Upper case', exercises: [] },
          ],
        }),
      );
      expect(error?.message).toBe('invalid_program');
      expect(await programRowCounts(user.id)).toEqual(before);
    });

    it('never overwrites a program id that another user already holds', async () => {
      const takenId = randomUUID();
      await db`insert into public.programs (id, owner_user_id, name) values (${takenId}, ${stranger.id}, 'Theirs')`;
      const { error } = await saveProgram(user, simpleProgram({ id: takenId, name: 'Mine' }));
      expect(error?.message).toBe('program_not_found');
      const [row] = await db`select owner_user_id, name from public.programs where id = ${takenId}`;
      expect(row).toEqual({ owner_user_id: stranger.id, name: 'Theirs' });
    });

    it("refuses another user's program id and a template id", async () => {
      const before = await programRowCounts(user.id);
      const strangerSave = await saveProgram(stranger, { ...(await programDoc(programId)), name: 'Stolen' });
      expect(strangerSave.error?.message).toBe('program_not_found');
      const templateSave = await saveProgram(user, { ...(await programDoc(templateIds.ppl)), name: 'Mine now' });
      expect(templateSave.error?.message).toBe('program_not_found');
      expect(await programRowCounts(user.id)).toEqual(before);
      const [program] = await db`select name from public.programs where id = ${programId}`;
      expect(program.name).toBe('Upper / Lower');
    });

    it('refuses a day id that belongs to another program', async () => {
      const templateDay = (await programDoc(templateIds.ppl)).days[0];
      const { error } = await saveProgram(user, simpleProgram({ days: [{ ...templateDay, exercises: [] }] }));
      expect(error?.message).toBe('invalid_program');
    });
  });

  it('refuses a cardio exercise in a program', async () => {
    const user = await createTestUser();
    const runningId = await builtInExerciseId('running');
    const program = simpleProgram({
      days: [
        {
          id: randomUUID(),
          name: 'Run day',
          exercises: [{ exerciseId: runningId, targetSets: 1, targetRepsMin: 1, targetRepsMax: 1 }],
        },
      ],
    });
    const before = await programRowCounts(user.id);
    const saved = await saveProgram(user, program);
    expect(saved.error?.message).toBe('unknown_exercise');
    expect(await programRowCounts(user.id)).toEqual(before);
  });

  it('refuses a locked variation until the caller has unlocked it', async () => {
    const user = await createTestUser();
    const pauseSquatId = await builtInExerciseId('pause_squat');
    const program = simpleProgram({
      days: [
        {
          id: randomUUID(),
          name: 'Legs',
          exercises: [{ exerciseId: pauseSquatId, targetSets: 3, targetRepsMin: 3, targetRepsMax: 5 }],
        },
      ],
    });
    const before = await programRowCounts(user.id);
    const locked = await saveProgram(user, program);
    expect(locked.error?.message).toBe('unknown_exercise');
    expect(await programRowCounts(user.id)).toEqual(before);

    await db`
      insert into public.user_unlocks (user_id, exercise_id, item_id)
      select ${user.id}, grants_exercise_id, id from public.items where key = 'scroll_pause_squat'`;
    const unlocked = await saveProgram(user, program);
    expect(unlocked.error).toBeNull();
    expect((await programDoc(program.id)).days[0].exercises.map((planned) => planned.exerciseId)).toEqual([
      pauseSquatId,
    ]);
  });

  it('refuses the 51st program', async () => {
    const user = await createTestUser();
    await db.begin(async (tx) => {
      for (let index = 0; index < 50; index++)
        await tx`insert into public.programs (id, owner_user_id, name) values (${randomUUID()}, ${user.id}, ${`P${index}`})`;
    });
    const { error } = await saveProgram(user, simpleProgram());
    expect(error?.message).toBe('too_many_programs');
    const copy = await user.client.rpc('copy_program', {
      source_program_id: templateIds.ppl,
      new_program_id: randomUUID(),
    });
    expect(copy.error?.message).toBe('too_many_programs');
    expect((await programRowCounts(user.id)).programs).toBe(50);
  });
});

describe('delete_program', () => {
  it('deletes the program and unlinks its sessions, but only for the owner', async () => {
    const [owner, stranger] = await Promise.all([createTestUser(), createTestUser()]);
    const programId = await copyTemplate(owner);
    const dayId = (await programDoc(programId)).days[0].id;
    const session = finishedSession(dayId);
    expect((await postCompleteSession(owner.accessToken, session)).status).toBe(200);
    expect(await storedProgramDayId(session.id)).toBe(dayId);

    const strangerDelete = await stranger.client.rpc('delete_program', { program_id: programId });
    expect(strangerDelete.error?.message).toBe('program_not_found');

    const { error } = await owner.client.rpc('delete_program', { program_id: programId });
    expect(error).toBeNull();
    expect(await programRowCounts(owner.id)).toEqual({ programs: 0, days: 0, exercises: 0 });
    expect(await storedProgramDayId(session.id)).toBeNull();
    const [sets] = await db`select count(*)::int as count from public.sets where session_id = ${session.id}`;
    expect(sets.count).toBe(1);
  });
});

describe('program row-level security', () => {
  it("hides another user's programs, days and planned exercises, and denies direct inserts", async () => {
    const [owner, stranger] = await Promise.all([createTestUser(), createTestUser()]);
    const programId = await copyTemplate(owner);
    const dayIds = (await programDoc(programId)).days.map((day) => day.id);

    const programs = await stranger.client.from('programs').select('id').eq('id', programId);
    const days = await stranger.client.from('program_days').select('id').in('id', dayIds);
    const planned = await stranger.client.from('program_day_exercises').select('day_id').in('day_id', dayIds);
    expect([programs.data, days.data, planned.data]).toEqual([[], [], []]);

    const programInsert = await owner.client
      .from('programs')
      .insert({ id: randomUUID(), owner_user_id: owner.id, name: 'Direct' });
    const dayInsert = await owner.client
      .from('program_days')
      .insert({ id: randomUUID(), program_id: programId, position: 5, name: 'Direct' });
    const plannedInsert = await owner.client.from('program_day_exercises').insert({
      day_id: dayIds[0],
      position: 19,
      exercise_id: benchId,
      target_sets: 1,
      target_reps_min: 1,
      target_reps_max: 1,
    });
    expect(programInsert.error).not.toBeNull();
    expect(dayInsert.error).not.toBeNull();
    expect(plannedInsert.error).not.toBeNull();
  });
});

describe('complete-session with a program day', () => {
  let owner: TestUser;
  let stranger: TestUser;
  let ownerDayId: string;

  beforeAll(async () => {
    [owner, stranger] = await Promise.all([createTestUser(), createTestUser()]);
    ownerDayId = (await programDoc(await copyTemplate(owner))).days[0].id;
  });

  it("stores the caller's own program day", async () => {
    const session = finishedSession(ownerDayId);
    expect((await postCompleteSession(owner.accessToken, session)).status).toBe(200);
    expect(await storedProgramDayId(session.id)).toBe(ownerDayId);
  });

  it("stores null for another user's day, a template day or a random id", async () => {
    const templateDayId = (await programDoc(templateIds.ppl)).days[0].id;
    for (const programDayId of [ownerDayId, templateDayId, randomUUID()]) {
      const session = finishedSession(programDayId);
      expect((await postCompleteSession(stranger.accessToken, session)).status).toBe(200);
      expect(await storedProgramDayId(session.id)).toBeNull();
    }
  });

  it('keeps the stored summary and day when a retry sends a different programDayId', async () => {
    const session = finishedSession(ownerDayId);
    const first = await postCompleteSession(owner.accessToken, session);
    const retry = await postCompleteSession(owner.accessToken, { ...session, programDayId: null });
    expect(retry.status).toBe(200);
    expect(retry.body).toEqual(first.body);
    expect(await storedProgramDayId(session.id)).toBe(ownerDayId);
  });
});

describe('last_logged_sets', () => {
  it('returns the latest non-warm-up set per exercise, only for the caller', async () => {
    const [lifter, stranger] = await Promise.all([createTestUser(), createTestUser()]);
    const later = payloadAt(hoursAgo(3), [
      aSet(benchId, 0, 70, { reps: 6 }),
      aSet(benchId, 1, 72.5),
      aSet(benchId, 2, 40, { reps: 12, isWarmup: true }),
    ]);
    const earlier = payloadAt(hoursAgo(20), [aSet(benchId, 0, 60, { reps: 8 }), aSet(squatId, 1, 100)]);
    for (const session of [earlier, later])
      expect((await postCompleteSession(lifter.accessToken, session)).status).toBe(200);
    expect(
      (await postCompleteSession(stranger.accessToken, payloadAt(hoursAgo(1), [aSet(benchId, 0, 200, { reps: 1 })])))
        .status,
    ).toBe(200);

    const { data, error } = await lifter.client.rpc('last_logged_sets', { exercise_ids: [benchId, squatId] });
    expect(error).toBeNull();
    const byExercise = Object.fromEntries(
      (data as { exercise_id: string; weight_kg: number; reps: number }[]).map((row) => [
        row.exercise_id,
        [Number(row.weight_kg), row.reps],
      ]),
    );
    expect(byExercise).toEqual({ [benchId]: [72.5, 5], [squatId]: [100, 5] });
  });
});
