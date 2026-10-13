import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  EXERCISE_COLUMNS,
  type ExerciseRow,
  isLiftExercise,
  toExercise,
} from '../../web/src/lib/exercises/catalog-rules.ts';
import {
  customLiftKey,
  customTemplateKey,
  type ProgramTemplateRow,
} from '../../web/src/lib/programs/program-enroll-rules.ts';
import { type EnrollmentRow } from '../../web/src/lib/programs/program-facts-rules.ts';
import { followStatus } from '../../web/src/lib/programs/program-follow-rules.ts';
import { PROGRAM_SELECT, type ProgramRow, toProgram } from '../../web/src/lib/programs/program-row-rules.ts';
import { createTestUser, db, type TestUser } from './local-stack.ts';
import { createCustomExercise } from './session-support.ts';
import {
  linearFiveByFive,
  type PlannedExerciseDoc,
  plannedDay,
  type ProgramDayDoc,
  publishedProgram,
  savedProgram,
} from './program-support.ts';

const LOAD_TYPES = ['external', 'bodyweight', 'bodyweight_plus'] as const;

type LoadType = (typeof LOAD_TYPES)[number];

function threeByEight(exerciseId: string, progression: 'none' | 'fixed', targetRepsMax = 8): PlannedExerciseDoc {
  return { exerciseId, targetSets: 3, targetRepsMin: 8, targetRepsMax, progression };
}

const PROGRAM_DAYS: Record<string, (changing: string, external: string) => ProgramDayDoc[]> = {
  'linear 5x5': (changing) => [plannedDay('Day A', [linearFiveByFive(changing)])],
  'fixed 3x8': (changing) => [plannedDay('Day A', [threeByEight(changing, 'fixed')])],
  'last weight 3x8-10': (changing) => [plannedDay('Day A', [threeByEight(changing, 'none', 10)])],
  'a linear lift repeated across days next to an external lift': (changing, external) => [
    plannedDay('Day A', [threeByEight(external, 'none'), linearFiveByFive(changing)]),
    plannedDay('Day B', [linearFiveByFive(changing, 1.25, 2.5), threeByEight(external, 'fixed')]),
  ],
};

interface PublishedCase {
  programId: string;
  exerciseIds: string[];
  template: { key: string; version: number };
}

let skillId: string;

beforeAll(async () => {
  [{ id: skillId }] = await db`select id from public.skills where key = 'chest'`;
});

afterAll(async () => {
  await db.end();
});

async function changeLoadType(user: TestUser, exerciseId: string, loadType: LoadType) {
  const saved = await user.client.rpc('save_custom_exercise', {
    exercise: {
      id: exerciseId,
      name: `Custom ${exerciseId.slice(0, 8)}`,
      loadType,
      equipment: 'other',
      shares: [{ skillId, shareBp: 10000 }],
    },
  });
  expect(saved.error).toBeNull();
}

async function publishedAfterLoadTypeChange(user: TestUser, loadType: LoadType): Promise<PublishedCase[]> {
  const cases: PublishedCase[] = [];
  for (const days of Object.values(PROGRAM_DAYS)) {
    const [changing, external] = [await createCustomExercise(user), await createCustomExercise(user)];
    const programId = await savedProgram(user, {
      id: randomUUID(),
      name: `Parity ${loadType}`,
      days: days(changing, external),
    });
    await changeLoadType(user, changing, loadType);
    cases.push({ programId, exerciseIds: [changing, external], template: await publishedProgram(user, programId) });
  }
  return cases;
}

async function webFollowStatus(user: TestUser, published: PublishedCase) {
  const [programs, templates, exercises] = await Promise.all([
    user.client.from('programs').select(PROGRAM_SELECT).eq('id', published.programId),
    user.client
      .from('program_templates')
      .select('key, version, name, definition, owner_user_id')
      .eq('key', published.template.key),
    user.client.from('exercises').select(EXERCISE_COLUMNS).in('id', published.exerciseIds),
  ]);
  for (const result of [programs, templates, exercises]) expect(result.error).toBeNull();
  const program = toProgram((programs.data as unknown as ProgramRow[])[0]);
  const byId = new Map((exercises.data as unknown as ExerciseRow[]).map((row) => [row.id, toExercise(row)]));
  const loadTypeOf = (exerciseId: string) => {
    const exercise = byId.get(exerciseId);
    return exercise && isLiftExercise(exercise) ? exercise.loadType : null;
  };
  const enrollment: EnrollmentRow = {
    id: randomUUID(),
    template_key: published.template.key,
    template_version: published.template.version,
    unit: 'kg',
    options: {},
    lift_bindings: {},
    inputs: {},
    rounding: { increment: 2.5, mode: 'nearest', barWeight: 20 },
    started_at: new Date().toISOString(),
    ended_at: null,
  };
  const rows = templates.data as ProgramTemplateRow[];
  const plannedLifts = program.days.flatMap((day) => day.exercises.map((planned) => customLiftKey(planned.exerciseId)));
  return {
    status: followStatus(program, enrollment, rows, loadTypeOf),
    template: rows[0],
    firstSeenLifts: [...new Set(plannedLifts)],
  };
}

describe('the web follow status of a just-published custom program', () => {
  it.each(LOAD_TYPES)(
    'is current for every program shape after its exercise changed to %s before publishing',
    async (loadType) => {
      const user = await createTestUser();
      const cases = await publishedAfterLoadTypeChange(user, loadType);
      const outcomes = await Promise.all(
        cases.map(async (published, index) => {
          const { status, template, firstSeenLifts } = await webFollowStatus(user, published);
          const lifts = (template.definition as { lifts: { key: string }[] }).lifts.map((lift) => lift.key);
          return {
            shape: Object.keys(PROGRAM_DAYS)[index],
            status,
            keyMatches: published.template.key === customTemplateKey(published.programId),
            liftsMatch: lifts.length > 0 && JSON.stringify(lifts) === JSON.stringify(firstSeenLifts),
          };
        }),
      );
      expect(outcomes).toEqual(
        Object.keys(PROGRAM_DAYS).map((shape) => ({ shape, status: 'current', keyMatches: true, liftsMatch: true })),
      );
    },
  );
});
