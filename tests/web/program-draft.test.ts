import { describe, expect, it } from 'vitest';
import {
  initialProgramState,
  type PrescribedExercise,
  type PrescribedSet,
  type PrescriptionSnapshot,
  resolvePrescription,
} from '@domain/index.ts';
import {
  addCardioExercise,
  addExercise,
  addSet,
  type CatalogEntry,
  type DraftProgram,
  type LiftDraftExercise,
  parseStoredDraft,
  removeExercise,
  removeSet,
  startDraftFromPrescription,
  swapExercise,
  toggleSetDone,
  updateBout,
  updateSet,
  withCurrentLoadTypes,
  type WorkoutDraft,
} from '../../web/src/offline/draft-format.ts';
import { type CardioActivity } from '../../web/src/lib/catalog-rules.ts';
import { completeSessionPayload } from '../../web/src/offline/session-payload.ts';
import { snapshot } from '../domain/program-fixtures/facts.ts';
import { MADCOW_5X5, madcowEnrollment, weekDay } from '../domain/program-fixtures/madcow_5x5.ts';

const userId = '11111111-1111-4111-8111-111111111111';

const MADCOW_MONDAY: DraftProgram = {
  enrollmentId: 'enrollment-madcow',
  position: { week: 1, day: 'mon' },
  templateKey: 'madcow_5x5',
};

const SQUAT_RAMP = snapshot('mon-squat:0', { weightKg: 70, reps: 5 });
const SQUAT_TOP = snapshot('mon-squat:4', { weightKg: 100, reps: 5 });

const RUNNING: CardioActivity = {
  paceUnit: 'per_km',
  referencePaceSPerKm: 360,
  maxEffort: 'max',
  shares: [{ skillKey: 'endurance', shareBasisPoints: 10_000 }],
};

function legacyV4Draft(): Record<string, unknown> {
  return {
    sessionId: '22222222-2222-4222-8222-222222222222',
    startedAt: '2026-10-05T06:00:00.000Z',
    finishedAt: null,
    programDayId: null,
    programLabel: null,
    exercises: [
      {
        exerciseId: 'squat',
        name: 'Squat',
        modality: 'lift',
        loadType: 'external',
        target: null,
        sets: [{ id: 'set-a', weightKg: 70, reps: 5, effort: null, done: true }],
      },
      {
        exerciseId: 'run',
        name: 'Running',
        modality: 'cardio',
        activity: RUNNING,
        sets: [
          {
            id: 'bout-a',
            kind: 'cardio',
            durationS: 600,
            distanceM: null,
            interval: null,
            effort: null,
            done: true,
          },
        ],
      },
    ],
  };
}

function programDraft(): WorkoutDraft {
  return {
    sessionId: '33333333-3333-4333-8333-333333333333',
    startedAt: '2026-10-05T06:00:00.000Z',
    finishedAt: '2026-10-05T07:00:00.000Z',
    programDayId: null,
    programLabel: 'Madcow 5x5 — W1 Day 1',
    program: MADCOW_MONDAY,
    exercises: [
      {
        exerciseId: 'squat',
        name: 'Squat',
        modality: 'lift',
        loadType: 'external',
        target: null,
        sets: [
          { id: 'squat-0', weightKg: 70, reps: 5, effort: null, done: false, prescription: SQUAT_RAMP },
          { id: 'squat-4', weightKg: 100, reps: 5, effort: null, done: false, prescription: SQUAT_TOP },
          { id: 'squat-extra', weightKg: 60, reps: 10, effort: null, done: false, prescription: null },
        ],
      },
      {
        exerciseId: 'bench',
        name: 'Bench',
        modality: 'lift',
        loadType: 'external',
        target: null,
        sets: [
          {
            id: 'bench-0',
            weightKg: 60,
            reps: 5,
            effort: null,
            done: false,
            prescription: snapshot('mon-bench:0', { weightKg: 60, reps: 5 }),
          },
        ],
      },
      {
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

function prescriptionsById(draft: WorkoutDraft): Map<string, PrescriptionSnapshot | null> {
  return new Map(
    draft.exercises
      .filter((exercise): exercise is LiftDraftExercise => exercise.modality === 'lift')
      .flatMap((exercise) => exercise.sets.map((set) => [set.id, set.prescription ?? null] as const)),
  );
}

function sentProgram(draft: WorkoutDraft): unknown {
  return (completeSessionPayload(draft) as { program?: unknown }).program;
}

function sentPrescription(set: object): PrescriptionSnapshot | null | undefined {
  return (set as { prescription?: PrescriptionSnapshot | null }).prescription;
}

function liftsOf(draft: WorkoutDraft): LiftDraftExercise[] {
  return draft.exercises.filter((exercise): exercise is LiftDraftExercise => exercise.modality === 'lift');
}

describe('parseStoredDraft with prescription details', () => {
  it.each([
    ['a percentage as text', { pct: '75%', optional: false }],
    ['no optional flag', { pct: 0.75 }],
    ['a string', 'optional'],
  ])('drops a malformed prescription detail (%s) and keeps the set', (_, prescriptionDetail) => {
    const draft = programDraft();
    const [squat] = liftsOf(draft);
    const withDetail = { ...squat, sets: squat.sets.map((set) => ({ ...set, prescriptionDetail })) };
    const raw = { ...draft, exercises: [withDetail, ...draft.exercises.slice(1)] };
    const parsed = parseStoredDraft({ v: 4, kind: 'draft', userId, updatedAt: 5, draft: raw }, userId);
    expect(parsed?.kind === 'draft' && liftsOf(parsed.draft)[0].sets.map((set) => set.id)).toEqual([
      'squat-0',
      'squat-4',
      'squat-extra',
    ]);
    expect(parsed?.kind === 'draft' && liftsOf(parsed.draft)[0].sets[0]).not.toHaveProperty('prescriptionDetail');
  });
});

describe('parseStoredDraft with program fields', () => {
  it('reads a v4 draft written before programs with a null program', () => {
    const parsed = parseStoredDraft({ v: 4, kind: 'draft', userId, updatedAt: 5, draft: legacyV4Draft() }, userId);
    expect(parsed?.kind === 'draft' && parsed.draft.program).toBeNull();
  });

  it('reads every lift set of a v4 draft written before programs with a null prescription', () => {
    const parsed = parseStoredDraft({ v: 4, kind: 'draft', userId, updatedAt: 5, draft: legacyV4Draft() }, userId);
    expect(parsed?.kind === 'draft' && liftsOf(parsed.draft)[0].sets[0].prescription).toBeNull();
  });

  it('adds no prescription to a cardio bout', () => {
    const parsed = parseStoredDraft({ v: 4, kind: 'draft', userId, updatedAt: 5, draft: legacyV4Draft() }, userId);
    expect(parsed?.kind === 'draft' && parsed.draft.exercises[1].sets[0]).not.toHaveProperty('prescription');
  });

  it('upgrades a v3 draft with a null program and null prescriptions', () => {
    const v3 = legacyV4Draft();
    const parsed = parseStoredDraft({ v: 3, kind: 'draft', userId, updatedAt: 5, draft: v3 }, userId);
    expect(parsed?.kind === 'draft' && parsed.draft.program).toBeNull();
    expect(parsed?.kind === 'draft' && liftsOf(parsed.draft)[0].sets[0].prescription).toBeNull();
  });

  it('keeps the program and the prescriptions of a program draft', () => {
    const raw = { v: 4, kind: 'draft', userId, updatedAt: 5, draft: programDraft() };
    expect(parseStoredDraft(raw, userId)).toEqual(raw);
  });

  it.each([
    ['a string', 'madcow'],
    ['no enrollment id', { position: { week: 1, day: 'mon' }, templateKey: 'madcow_5x5' }],
    ['no position', { enrollmentId: 'enrollment-madcow', templateKey: 'madcow_5x5' }],
    ['no template key', { enrollmentId: 'enrollment-madcow', position: { week: 1, day: 'mon' } }],
  ])('reads a malformed program (%s) as no program instead of dropping the draft', (_, program) => {
    const parsed = parseStoredDraft(
      { v: 4, kind: 'draft', userId, updatedAt: 5, draft: { ...programDraft(), program } },
      userId,
    );
    expect(parsed?.kind).toBe('draft');
    expect(parsed?.kind === 'draft' && parsed.draft.program).toBeNull();
  });

  it.each([
    ['a string', 'mon-squat:0'],
    ['no ref', { weightKg: 70, reps: 5, minReps: null, amrap: false }],
    ['a weight that is not a number', { ref: 'mon-squat:0', weightKg: '70', reps: 5, minReps: null, amrap: false }],
    ['no amrap flag', { ref: 'mon-squat:0', weightKg: 70, reps: 5, minReps: null }],
  ])('reads a malformed prescription (%s) as no prescription', (_, prescription) => {
    const draft = programDraft();
    const [squat] = liftsOf(draft);
    const broken = {
      ...draft,
      exercises: [{ ...squat, sets: [{ ...squat.sets[0], prescription }] }],
    };
    const parsed = parseStoredDraft({ v: 4, kind: 'draft', userId, updatedAt: 5, draft: broken }, userId);
    expect(parsed?.kind === 'draft' && liftsOf(parsed.draft)[0].sets[0].prescription).toBeNull();
  });
});

const MUTATIONS: [string, (draft: WorkoutDraft) => WorkoutDraft | null][] = [
  ['addExercise', (draft) => addExercise(draft, 'curl', 'Curl', 'external')],
  ['addCardioExercise', (draft) => addCardioExercise(draft, 'row-erg', 'Rowing', RUNNING)],
  ['removeExercise', (draft) => removeExercise(draft, 1)],
  ['addSet', (draft) => addSet(draft, 0)],
  ['updateSet', (draft) => updateSet(draft, 0, 'squat-4', { weightKg: 102.5, reps: 6 })],
  ['updateBout', (draft) => updateBout(draft, 2, 'bout-a', { durationS: 900 })],
  ['removeSet', (draft) => removeSet(draft, 0, 'squat-extra')],
  ['toggleSetDone', (draft) => toggleSetDone(draft, 0, 'squat-4')],
  ['swapExercise', (draft) => swapExercise(draft, 1, { id: 'incline', name: 'Incline bench', loadType: 'external' })],
  ['withCurrentLoadTypes', (draft) => withCurrentLoadTypes(draft, new Map([['bench', 'bodyweight_plus']])).draft],
];

describe('draft mutations on a program draft', () => {
  it.each(MUTATIONS)('%s keeps the draft program', (_, mutate) => {
    expect(mutate(programDraft())?.program).toEqual(MADCOW_MONDAY);
  });

  it.each(MUTATIONS)('%s keeps the prescription of every set it keeps', (_, mutate) => {
    const before = prescriptionsById(programDraft());
    const after = prescriptionsById(mutate(programDraft())!);
    for (const [setId, prescription] of after) {
      if (before.has(setId)) expect(prescription, setId).toEqual(before.get(setId));
    }
  });

  it('gives a set added with + Add set no prescription, even after a prescribed set', () => {
    const added = addSet(programDraft(), 1);
    const [, bench] = liftsOf(added);
    expect(bench.sets).toHaveLength(2);
    expect(bench.sets[1].prescription ?? null).toBeNull();
  });
});

function prescribedSet(ref: string, weightKg: number | null, reps: number | null, extra: Partial<PrescribedSet> = {}) {
  const set: PrescribedSet = {
    ref,
    weight: weightKg,
    weightKg,
    pct: null,
    reps,
    maxReps: null,
    minReps: null,
    amrap: false,
    optional: false,
    snapshot:
      weightKg === null || reps === null
        ? null
        : { ref, weightKg, reps, minReps: extra.minReps ?? null, amrap: extra.amrap ?? false },
    ...extra,
  };
  return set;
}

const MONDAY_PRESCRIPTION: PrescribedExercise[] = [
  {
    kind: 'exercise',
    slotId: 'mon-squat',
    lift: 'squat',
    exerciseId: 'squat',
    role: 'main',
    sets: [prescribedSet('mon-squat:0', 70, 5), prescribedSet('mon-squat:4', 100, 5, { amrap: true, minReps: 5 })],
  },
  {
    kind: 'exercise',
    slotId: 'mon-row',
    lift: 'row',
    exerciseId: 'old-row',
    role: 'main',
    sets: [prescribedSet('mon-row:0', 50, 5)],
  },
  {
    kind: 'exercise',
    slotId: 'mon-hyper',
    lift: 'hyper',
    exerciseId: 'hyper',
    role: 'assistance',
    sets: [prescribedSet('mon-hyper:0', null, null, { optional: true })],
  },
  {
    kind: 'exercise',
    slotId: 'mon-situp',
    lift: 'situp',
    exerciseId: 'gone',
    role: 'assistance',
    sets: [prescribedSet('mon-situp:0', null, null, { optional: true })],
  },
  {
    kind: 'exercise',
    slotId: 'mon-carry',
    lift: 'carry',
    exerciseId: 'run',
    role: 'assistance',
    sets: [prescribedSet('mon-carry:0', 40, 1)],
  },
];

const PRESCRIPTION_CATALOG = new Map<string, CatalogEntry>([
  ['squat', { name: 'Squat', loadType: 'external', archived: false }],
  ['old-row', { name: 'Barbell row', loadType: 'external', archived: true }],
  ['hyper', { name: 'Hyperextension', loadType: 'external', archived: false }],
  ['run', { name: 'Running', modality: 'cardio', archived: false }],
]);

const STARTED_AT = new Date('2026-10-05T06:00:00.000Z');

function startMonday() {
  return startDraftFromPrescription(
    {
      enrollmentId: 'enrollment-madcow',
      templateKey: 'madcow_5x5',
      programName: 'Madcow 5x5',
      dayName: 'W1 Day 1',
      position: { week: 1, day: 'mon' },
      exercises: MONDAY_PRESCRIPTION,
    },
    PRESCRIPTION_CATALOG,
    STARTED_AT,
  );
}

function engineMadcowMonday(): WorkoutDraft {
  const enrollment = madcowEnrollment();
  const resolved = resolvePrescription(
    MADCOW_5X5,
    enrollment,
    initialProgramState(MADCOW_5X5, enrollment),
    weekDay(1, 'mon'),
    {},
  ).filter((slot): slot is PrescribedExercise => slot.kind === 'exercise');
  const catalog = new Map<string, CatalogEntry>(
    resolved.map((slot) => [slot.exerciseId, { name: slot.lift, loadType: 'external', archived: false }]),
  );
  return startDraftFromPrescription(
    {
      enrollmentId: enrollment.id,
      templateKey: 'madcow_5x5',
      programName: 'Madcow 5x5',
      dayName: 'W1 Day 1',
      position: weekDay(1, 'mon'),
      exercises: resolved,
    },
    catalog,
    STARTED_AT,
  ).draft;
}

describe('startDraftFromPrescription', () => {
  it('links the draft to the enrollment, its template and the position', () => {
    expect(startMonday().draft.program).toEqual(MADCOW_MONDAY);
  });

  it('labels the draft with the program and day, without a custom program day', () => {
    expect(startMonday().draft).toMatchObject({
      programDayId: null,
      programLabel: 'Madcow 5x5 — W1 Day 1',
      startedAt: '2026-10-05T06:00:00.000Z',
      finishedAt: null,
    });
  });

  it('gives the draft a fresh session id', () => {
    expect(startMonday().draft.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(startMonday().draft.sessionId).not.toBe(startMonday().draft.sessionId);
  });

  it('plans one not-done set per prescribed set with the prescribed weight and reps', () => {
    const [squat] = liftsOf(startMonday().draft);
    expect(squat).toMatchObject({ exerciseId: 'squat', name: 'Squat', modality: 'lift', loadType: 'external' });
    expect(squat.sets.map((set) => [set.weightKg, set.reps, set.done, set.effort])).toEqual([
      [70, 5, false, null],
      [100, 5, false, null],
    ]);
  });

  it('copies each prescribed set snapshot, ref included, onto its draft set', () => {
    const [squat] = liftsOf(startMonday().draft);
    expect(squat.sets.map((set) => set.prescription)).toEqual([
      { ref: 'mon-squat:0', weightKg: 70, reps: 5, minReps: null, amrap: false },
      { ref: 'mon-squat:4', weightKg: 100, reps: 5, minReps: 5, amrap: true },
    ]);
  });

  it('gives every draft set its own id', () => {
    const ids = liftsOf(startMonday().draft).flatMap((exercise) => exercise.sets.map((set) => set.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('labels an archived exercise', () => {
    expect(liftsOf(startMonday().draft)[1].name).toBe('Barbell row (archived)');
  });

  it('plans a set with no prescribed load at the default weight and reps, without a snapshot', () => {
    const hyper = liftsOf(startMonday().draft).find((exercise) => exercise.exerciseId === 'hyper');
    expect(hyper?.sets.map((set) => [set.weightKg, set.reps, set.prescription])).toEqual([[20, 8, null]]);
  });

  it("copies each prescribed set's percentage and optional flag as its prescription detail", () => {
    const hyper = liftsOf(startMonday().draft).find((exercise) => exercise.exerciseId === 'hyper');
    expect(hyper?.sets.map((set) => set.prescriptionDetail)).toEqual([{ pct: null, optional: true }]);
  });

  it("copies the engine's Madcow week 1 Monday squat percentages: 50, 62.5, 75, 87.5 and 100%", () => {
    const [squat] = liftsOf(engineMadcowMonday());
    expect(squat.sets.map((set) => set.prescriptionDetail)).toEqual(
      [0.5, 0.625, 0.75, 0.875, 1].map((pct) => ({ pct, optional: false })),
    );
  });

  it('skips an exercise missing from the catalog or bound to a cardio exercise and reports it', () => {
    const started = startMonday();
    expect(started.draft.exercises.map((exercise) => exercise.exerciseId)).toEqual(['squat', 'old-row', 'hyper']);
    expect(started.skippedExerciseIds).toEqual(['gone', 'run']);
  });
});

describe('completeSessionPayload with a program', () => {
  it('sends the enrollment and position, but not the template key', () => {
    expect(sentProgram(programDraft())).toEqual({
      enrollmentId: 'enrollment-madcow',
      position: { week: 1, day: 'mon' },
    });
  });

  it('sends a null program for a draft without one', () => {
    expect(sentProgram({ ...programDraft(), program: null })).toBeNull();
  });

  it('sends a null program for a draft written before programs', () => {
    const legacy = legacyV4Draft() as unknown as WorkoutDraft;
    expect(sentProgram({ ...legacy, finishedAt: '2026-10-05T07:00:00.000Z' })).toBeNull();
  });

  it('sends the prescription of each done lift set, and null for a set without one', () => {
    const draft = ['squat-0', 'squat-4', 'squat-extra'].reduce(
      (current, setId) => toggleSetDone(current, 0, setId),
      programDraft(),
    );
    const lifts = completeSessionPayload(draft).sets.filter((set) => !('kind' in set));
    expect(lifts.map((set) => [sentPrescription(set), set.id])).toEqual([
      [SQUAT_RAMP, 'squat-0'],
      [SQUAT_TOP, 'squat-4'],
      [null, 'squat-extra'],
    ]);
  });

  it('sends no prescription on a cardio bout', () => {
    const [bout] = completeSessionPayload(programDraft()).sets;
    expect(bout).toMatchObject({ kind: 'cardio', id: 'bout-a' });
    expect(bout).not.toHaveProperty('prescription');
  });

  it("sends the refs of a draft started from the engine's Madcow week 1 Monday", () => {
    const draft = engineMadcowMonday();
    const doneSets = draft.exercises.flatMap((exercise, index) => exercise.sets.map((set) => ({ index, id: set.id })));
    const done = doneSets.reduce<WorkoutDraft>((current, set) => toggleSetDone(current, set.index, set.id), {
      ...draft,
      finishedAt: '2026-10-05T07:00:00.000Z',
    });
    const sentRefs = completeSessionPayload(done)
      .sets.map((set) => sentPrescription(set)?.ref)
      .filter((ref) => ref !== undefined);
    expect(sentRefs).toEqual(
      ['mon-squat', 'mon-bench', 'mon-row'].flatMap((slot) => [0, 1, 2, 3, 4].map((index) => `${slot}:${index}`)),
    );
  });
});
