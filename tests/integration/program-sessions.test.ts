import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { programStateAt, type ProgramDefinition } from '@domain/index.ts';
import {
  type EnrollmentFactsRows,
  enrollmentFromRow,
  programFactsFromRows,
} from '../../web/src/lib/programs/program-facts-rules.ts';
import {
  builtInExerciseId,
  createTestUser,
  databaseNow,
  db,
  lootSnapshot,
  normalizedSnapshot,
  postCompleteSession,
  postFunction,
  rowCounts,
  type TestUser,
} from './local-stack.ts';
import { customLiftKey, linearFiveByFive, plannedDay, publishedProgram, savedProgram } from './program-support.ts';
import { aBout, hoursAgo, payloadAt } from './session-support.ts';

interface PrescriptionBody {
  ref: string;
  weightKg: number;
  reps: number;
  minReps?: number | null;
  amrap: boolean;
}

type LiftEffort = { type: 'rir'; value: number };

interface ProgramSetBody {
  id: string;
  exerciseId: string;
  position: number;
  weightKg: number;
  reps: number;
  isWarmup: boolean;
  effort: LiftEffort;
  prescription?: PrescriptionBody | null;
}

interface ProgramLink {
  enrollmentId: string;
  position: Record<string, unknown>;
}

interface EnrollmentFacts {
  enrollment: Record<string, unknown>;
  events: { id: string; kind: string; payload: unknown; effective_at: string }[];
  sessions: { id: string; completed_at: string; program_position: unknown; sets: Record<string, unknown>[] }[];
}

const MONDAY_WEEK_1 = { week: 1, day: 'mon' };
const RIR_2: LiftEffort = { type: 'rir', value: 2 };

let exerciseIds: Record<string, string>;

beforeAll(async () => {
  const keys = ['back_squat', 'barbell_bench_press', 'barbell_row', 'overhead_press', 'deadlift', 'running'];
  exerciseIds = Object.fromEntries(await Promise.all(keys.map(async (key) => [key, await builtInExerciseId(key)])));
});

afterAll(async () => {
  await db.end();
});

function madcowBindings(): Record<string, string | null> {
  return {
    squat: exerciseIds.back_squat,
    bench: exerciseIds.barbell_bench_press,
    row: exerciseIds.barbell_row,
    press: exerciseIds.overhead_press,
    deadlift: exerciseIds.deadlift,
    hyper: null,
  };
}

async function enrollInMadcow(user: TestUser): Promise<string> {
  const result = await user.client.rpc('enroll_program', {
    enrollment: {
      templateKey: 'madcow_5x5',
      templateVersion: 2,
      unit: 'kg',
      options: { rampStep: 0.125 },
      bindings: madcowBindings(),
      inputs: {
        squat: { fiveRm: 100 },
        bench: { fiveRm: 80 },
        row: { fiveRm: 70 },
        press: { fiveRm: 50 },
        deadlift: { fiveRm: 140 },
      },
      rounding: { increment: 2.5, mode: 'nearest', barWeight: 20 },
    },
  });
  expect(result.error).toBeNull();
  return result.data as string;
}

function prescribed(ref: string, weightKg: number, reps = 5, extra: Partial<PrescriptionBody> = {}): PrescriptionBody {
  return { ref, weightKg, reps, amrap: false, ...extra };
}

function squatSet(position: number, weightKg: number, prescription: PrescriptionBody | null, reps = 5): ProgramSetBody {
  return {
    id: randomUUID(),
    exerciseId: exerciseIds.back_squat,
    position,
    weightKg,
    reps,
    isWarmup: false,
    effort: RIR_2,
    prescription,
  };
}

function withoutPrescription(set: ProgramSetBody): ProgramSetBody {
  const copy = { ...set };
  delete copy.prescription;
  return copy;
}

function mondaySquatSets(): ProgramSetBody[] {
  return [
    squatSet(0, 60, prescribed('mon-squat:0', 60)),
    squatSet(1, 70, prescribed('mon-squat:1', 70)),
    squatSet(2, 80, prescribed('mon-squat:2', 80)),
  ];
}

function linkedPayload(sets: object[], program: ProgramLink | null, startedAt = hoursAgo(1)) {
  return { ...payloadAt(startedAt, sets as ProgramSetBody[]), program };
}

async function sessionRow(sessionId: string) {
  const [row] = await db`
    select enrollment_id, program_position, completed_at,
           completed_at = date_trunc('milliseconds', completed_at) as completed_at_in_milliseconds
    from public.sessions where id = ${sessionId}`;
  return row;
}

async function snapshotsOf(sessionId: string) {
  return await db`
    select position, prescription_ref, prescribed_weight_kg::float, prescribed_reps, prescribed_min_reps, prescribed_amrap
    from public.sets where session_id = ${sessionId} order by position`;
}

function noSnapshot(position: number) {
  return {
    position,
    prescription_ref: null,
    prescribed_weight_kg: null,
    prescribed_reps: null,
    prescribed_min_reps: null,
    prescribed_amrap: null,
  };
}

async function factsOf(user: TestUser, enrollmentId: string) {
  return await user.client.rpc('enrollment_facts', { enrollment_id: enrollmentId });
}

async function linkedFacts(user: TestUser, enrollmentId: string): Promise<EnrollmentFacts> {
  const result = await factsOf(user, enrollmentId);
  expect(result.error).toBeNull();
  return result.data as EnrollmentFacts;
}

async function edit(user: TestUser, sessionId: string, sets: object[]) {
  return await postFunction('edit-session', user.accessToken, { sessionId, ifRevision: 0, notes: null, sets });
}

describe('complete-session with a program link', () => {
  it('stores the link, the position and the snapshot of every prescribed set', async () => {
    const user = await createTestUser();
    const enrollmentId = await enrollInMadcow(user);
    const payload = linkedPayload([...mondaySquatSets(), squatSet(3, 50, null, 10)], {
      enrollmentId,
      position: MONDAY_WEEK_1,
    });

    const response = await postCompleteSession(user.accessToken, payload);

    expect(response.status, response.rawBody).toBe(200);
    expect(response.body.programLinked).toBe(true);
    expect(await sessionRow(payload.id)).toMatchObject({
      enrollment_id: enrollmentId,
      program_position: MONDAY_WEEK_1,
    });
    expect(await snapshotsOf(payload.id)).toEqual([
      ...[60, 70, 80].map((weightKg, position) => ({
        position,
        prescription_ref: `mon-squat:${position}`,
        prescribed_weight_kg: weightKg,
        prescribed_reps: 5,
        prescribed_min_reps: null,
        prescribed_amrap: false,
      })),
      noSnapshot(3),
    ]);
  });

  it('stores the minimum reps and the amrap flag of a snapshot', async () => {
    const user = await createTestUser();
    const enrollmentId = await enrollInMadcow(user);
    const payload = linkedPayload(
      [squatSet(0, 100, prescribed('fri-squat:4', 100, 3, { amrap: true, minReps: 3 }), 6)],
      { enrollmentId, position: { week: 1, day: 'fri' } },
    );

    expect((await postCompleteSession(user.accessToken, payload)).status).toBe(200);

    expect(await snapshotsOf(payload.id)).toEqual([
      {
        position: 0,
        prescription_ref: 'fri-squat:4',
        prescribed_weight_kg: 100,
        prescribed_reps: 3,
        prescribed_min_reps: 3,
        prescribed_amrap: true,
      },
    ]);
  });

  it('stores the any-weight snapshot of a 5RM test set, prescribed at 0 kg, next to the unprescribed sets of the attempt', async () => {
    const user = await createTestUser();
    const enrollmentId = await enrollInMadcow(user);
    const payload = linkedPayload([squatSet(0, 60, prescribed('mon-squat:retest', 0)), squatSet(1, 110, null)], {
      enrollmentId,
      position: MONDAY_WEEK_1,
    });

    expect((await postCompleteSession(user.accessToken, payload)).status).toBe(200);

    expect(await snapshotsOf(payload.id)).toEqual([
      {
        position: 0,
        prescription_ref: 'mon-squat:retest',
        prescribed_weight_kg: 0,
        prescribed_reps: 5,
        prescribed_min_reps: null,
        prescribed_amrap: false,
      },
      noSnapshot(1),
    ]);
  });

  it('answers with completedAt, the server time it stored, at millisecond precision', async () => {
    const user = await createTestUser();
    const enrollmentId = await enrollInMadcow(user);
    const payload = linkedPayload(mondaySquatSets(), { enrollmentId, position: MONDAY_WEEK_1 });

    const before = await databaseNow();
    const response = await postCompleteSession(user.accessToken, payload);
    const after = await databaseNow();

    expect(response.status, response.rawBody).toBe(200);
    const row = await sessionRow(payload.id);
    expect(row.completed_at_in_milliseconds).toBe(true);
    expect(response.body.completedAt).toBe(new Date(row.completed_at).toISOString());
    const completedAt = Date.parse(response.body.completedAt!);
    expect(completedAt).toBeGreaterThanOrEqual(before - 1);
    expect(completedAt).toBeLessThanOrEqual(after);
  });

  it('keeps the link when the enrollment ended between the start of the draft and the sync', async () => {
    const user = await createTestUser();
    const enrollmentId = await enrollInMadcow(user);
    const ended = await user.client.rpc('end_enrollment', { enrollment_id: enrollmentId });
    expect(ended.error).toBeNull();
    const payload = linkedPayload(mondaySquatSets(), { enrollmentId, position: MONDAY_WEEK_1 });

    const response = await postCompleteSession(user.accessToken, payload);

    expect(response.status, response.rawBody).toBe(200);
    expect(response.body.programLinked).toBe(true);
    expect((await sessionRow(payload.id)).enrollment_id).toBe(enrollmentId);
    expect((await snapshotsOf(payload.id)).map((row) => row.prescription_ref)).toEqual([
      'mon-squat:0',
      'mon-squat:1',
      'mon-squat:2',
    ]);
  });

  it("stores the session unlinked and without snapshots when the enrollment is another user's", async () => {
    const owner = await createTestUser();
    const intruder = await createTestUser();
    const enrollmentId = await enrollInMadcow(owner);
    const payload = linkedPayload(mondaySquatSets(), { enrollmentId, position: MONDAY_WEEK_1 });

    const response = await postCompleteSession(intruder.accessToken, payload);

    expect(response.status, response.rawBody).toBe(200);
    expect(response.body.programLinked).toBe(false);
    expect(await sessionRow(payload.id)).toMatchObject({ enrollment_id: null, program_position: null });
    expect(await snapshotsOf(payload.id)).toEqual([0, 1, 2].map(noSnapshot));
  });

  it('stores the session unlinked when the enrollment does not exist', async () => {
    const user = await createTestUser();
    const payload = linkedPayload(mondaySquatSets(), { enrollmentId: randomUUID(), position: MONDAY_WEEK_1 });

    const response = await postCompleteSession(user.accessToken, payload);

    expect(response.status, response.rawBody).toBe(200);
    expect(response.body.programLinked).toBe(false);
    expect(await snapshotsOf(payload.id)).toEqual([0, 1, 2].map(noSnapshot));
  });

  it.each([
    ['a week past the 520 week bound', { week: 521, day: 'mon' }],
    ['week zero', { week: 0, day: 'mon' }],
    ['a day the template does not have', { week: 1, day: 'sun' }],
    ['a cycle position on a weekly schedule', { cycle: 1, week: 1, day: 'mon' }],
    ['a rotation position on a weekly schedule', { index: 0 }],
    ['a fractional week', { week: 1.5, day: 'mon' }],
  ])('stores the session unlinked and without snapshots for %s', async (_, position) => {
    const user = await createTestUser();
    const enrollmentId = await enrollInMadcow(user);
    const payload = linkedPayload(mondaySquatSets(), { enrollmentId, position });

    const response = await postCompleteSession(user.accessToken, payload);

    expect(response.status, response.rawBody).toBe(200);
    expect(response.body.programLinked).toBe(false);
    expect(await sessionRow(payload.id)).toMatchObject({ enrollment_id: null, program_position: null });
    expect(await snapshotsOf(payload.id)).toEqual([0, 1, 2].map(noSnapshot));
  });

  it('stores a session without a program unlinked, dropping any snapshots it carries', async () => {
    const user = await createTestUser();
    const payload = payloadAt(hoursAgo(1), mondaySquatSets());

    const response = await postCompleteSession(user.accessToken, payload);

    expect(response.status, response.rawBody).toBe(200);
    expect(response.body.programLinked).toBe(false);
    expect(await snapshotsOf(payload.id)).toEqual([0, 1, 2].map(noSnapshot));
  });

  it.each([
    ['a 2500 kg weight', prescribed('mon-squat:1', 2500)],
    ['a negative weight', prescribed('mon-squat:1', -5)],
    ['zero reps', prescribed('mon-squat:1', 70, 0)],
    ['101 reps', prescribed('mon-squat:1', 70, 101)],
    ['minimum reps past the integer range', prescribed('mon-squat:1', 70, 5, { minReps: 2147483648 })],
    ['negative minimum reps', prescribed('mon-squat:1', 70, 5, { minReps: -1 })],
    ['minimum reps above the reps', prescribed('mon-squat:1', 70, 5, { minReps: 6 })],
  ])('drops only the snapshot with %s and still stores the linked session', async (_, outOfRange) => {
    const user = await createTestUser();
    const enrollmentId = await enrollInMadcow(user);
    const [first, , third] = mondaySquatSets();
    const payload = linkedPayload([first, squatSet(1, 70, outOfRange), third], {
      enrollmentId,
      position: MONDAY_WEEK_1,
    });

    const response = await postCompleteSession(user.accessToken, payload);

    expect(response.status, response.rawBody).toBe(200);
    expect(response.body.programLinked).toBe(true);
    const snapshots = await snapshotsOf(payload.id);
    expect(snapshots.map((row) => row.prescription_ref)).toEqual(['mon-squat:0', null, 'mon-squat:2']);
    expect(snapshots[1]).toEqual(noSnapshot(1));
  });

  it.each([
    ['without the amrap flag', { ref: 'mon-squat:0', weightKg: 60, reps: 5 }],
    ['without a ref', { weightKg: 60, reps: 5, amrap: false }],
    ['with an empty ref', { ref: '', weightKg: 60, reps: 5, amrap: false }],
    ['with a numeric ref', { ref: 7, weightKg: 60, reps: 5, amrap: false }],
    ['with a ref longer than 100 characters', { ref: 'x'.repeat(101), weightKg: 60, reps: 5, amrap: false }],
    ['with a NUL character in the ref', { ref: 'mon-squat:\u00000', weightKg: 60, reps: 5, amrap: false }],
    ['with a weight that is not a number', { ref: 'mon-squat:0', weightKg: '60', reps: 5, amrap: false }],
    ['with fractional reps', { ref: 'mon-squat:0', weightKg: 60, reps: 4.5, amrap: false }],
    ['with fractional minimum reps', { ref: 'mon-squat:0', weightKg: 60, reps: 5, minReps: 2.5, amrap: false }],
    ['with an unknown key', { ref: 'mon-squat:0', weightKg: 60, reps: 5, amrap: false, pct: 0.8 }],
    ['that is not an object', 'mon-squat:0'],
  ])('stores the linked session and drops only a prescription %s', async (_, malformed) => {
    const user = await createTestUser();
    const enrollmentId = await enrollInMadcow(user);
    const [first, ...rest] = mondaySquatSets();
    const payload = linkedPayload([{ ...first, prescription: malformed }, ...rest], {
      enrollmentId,
      position: MONDAY_WEEK_1,
    });

    const response = await postCompleteSession(user.accessToken, payload);

    expect(response.status, response.rawBody).toBe(200);
    expect(response.body.programLinked).toBe(true);
    expect((await snapshotsOf(payload.id)).map((row) => row.prescription_ref)).toEqual([
      null,
      'mon-squat:1',
      'mon-squat:2',
    ]);
  });

  it('stores a cardio bout that carries a prescription and ignores the prescription', async () => {
    const user = await createTestUser();
    const enrollmentId = await enrollInMadcow(user);
    const bout = { ...aBout(exerciseIds.running, 3), prescription: prescribed('mon-squat:3', 60) };
    const payload = linkedPayload([...mondaySquatSets(), bout], { enrollmentId, position: MONDAY_WEEK_1 });

    const response = await postCompleteSession(user.accessToken, payload);

    expect(response.status, response.rawBody).toBe(200);
    expect(response.body.programLinked).toBe(true);
    expect(await snapshotsOf(payload.id)).toHaveLength(4);
    expect((await snapshotsOf(payload.id))[3]).toEqual(noSnapshot(3));
  });

  it('keeps the snapshot of the first set per ref and drops it from later sets with the same ref', async () => {
    const user = await createTestUser();
    const enrollmentId = await enrollInMadcow(user);
    const payload = linkedPayload(
      [
        squatSet(0, 60, prescribed('mon-squat:0', 60)),
        squatSet(1, 65, prescribed('mon-squat:0', 65)),
        squatSet(2, 70, prescribed('mon-squat:1', 70)),
        squatSet(3, 75, prescribed('mon-squat:0', 75)),
      ],
      { enrollmentId, position: MONDAY_WEEK_1 },
    );

    const response = await postCompleteSession(user.accessToken, payload);

    expect(response.status, response.rawBody).toBe(200);
    const snapshots = await snapshotsOf(payload.id);
    expect(snapshots.map((row) => row.prescription_ref)).toEqual(['mon-squat:0', null, 'mon-squat:1', null]);
    expect(snapshots[0].prescribed_weight_kg).toBe(60);
  });

  it.each([
    ['an enrollment id that is not a uuid', () => ({ enrollmentId: 'madcow', position: MONDAY_WEEK_1 })],
    ['no position', (enrollmentId: string) => ({ enrollmentId })],
    ['a position that is not an object', (enrollmentId: string) => ({ enrollmentId, position: 'mon' })],
    ['an unknown key', (enrollmentId: string) => ({ enrollmentId, position: MONDAY_WEEK_1, day: 1 })],
    ['a program that is not an object', () => 'madcow'],
    [
      'a NUL character in a position value',
      (enrollmentId: string) => ({ enrollmentId, position: { week: 1, day: 'mon\u0000' } }),
    ],
    [
      'a NUL character in a position key',
      (enrollmentId: string) => ({ enrollmentId, position: { week: 1, day: 'mon', ['x\u0000']: 1 } }),
    ],
  ])('stores the session unlinked and without snapshots for a program with %s', async (_, programFor) => {
    const user = await createTestUser();
    const enrollmentId = await enrollInMadcow(user);
    const payload = { ...payloadAt(hoursAgo(1), mondaySquatSets()), program: programFor(enrollmentId) };

    const response = await postCompleteSession(user.accessToken, payload);

    expect(response.status, response.rawBody).toBe(200);
    expect(response.body.programLinked).toBe(false);
    expect(await sessionRow(payload.id)).toMatchObject({ enrollment_id: null, program_position: null });
    expect(await snapshotsOf(payload.id)).toEqual([0, 1, 2].map(noSnapshot));
  });
});

describe('complete-session resubmits of a linked session', () => {
  it('returns the stored completedAt and programLinked and writes nothing more', async () => {
    const user = await createTestUser();
    const enrollmentId = await enrollInMadcow(user);
    const payload = linkedPayload(mondaySquatSets(), { enrollmentId, position: MONDAY_WEEK_1 });
    const first = await postCompleteSession(user.accessToken, payload);
    expect(first.status, first.rawBody).toBe(200);
    const before = await rowCounts(user.id, ['sessions', 'sets', 'set_skill_xp']);

    const retry = await postCompleteSession(user.accessToken, payload);

    expect(retry.status, retry.rawBody).toBe(200);
    expect(retry.body.completedAt).toBe(first.body.completedAt);
    expect(retry.body.programLinked).toBe(true);
    expect(retry.rawBody).toBe(first.rawBody);
    expect(await rowCounts(user.id, ['sessions', 'sets', 'set_skill_xp'])).toEqual(before);
  });

  it('answers a resubmit with the stored link even when the retry leaves the program out', async () => {
    const user = await createTestUser();
    const enrollmentId = await enrollInMadcow(user);
    const payload = linkedPayload(mondaySquatSets(), { enrollmentId, position: MONDAY_WEEK_1 });
    const first = await postCompleteSession(user.accessToken, payload);
    expect(first.status, first.rawBody).toBe(200);

    const retry = await postCompleteSession(user.accessToken, { ...payload, program: null });

    expect(retry.status, retry.rawBody).toBe(200);
    expect(retry.body.programLinked).toBe(true);
    expect(retry.body.completedAt).toBe(first.body.completedAt);
  });

  it('answers a resubmit of an unlinked session with programLinked false', async () => {
    const user = await createTestUser();
    const payload = linkedPayload(mondaySquatSets(), null);
    const first = await postCompleteSession(user.accessToken, payload);
    expect(first.status, first.rawBody).toBe(200);

    const retry = await postCompleteSession(user.accessToken, payload);

    expect(retry.body).toMatchObject({ programLinked: false, completedAt: first.body.completedAt });
  });

  it('still answers 410 session_deleted for a linked session that was deleted', async () => {
    const user = await createTestUser();
    const enrollmentId = await enrollInMadcow(user);
    const payload = linkedPayload(mondaySquatSets(), { enrollmentId, position: MONDAY_WEEK_1 });
    expect((await postCompleteSession(user.accessToken, payload)).status).toBe(200);
    const deleted = await postFunction('delete-session', user.accessToken, { sessionId: payload.id });
    expect(deleted.status, deleted.rawBody).toBe(200);

    const retry = await postCompleteSession(user.accessToken, payload);

    expect(retry.status).toBe(410);
    expect(retry.body).toEqual({ error: 'session_deleted' });
  });
});

describe('complete-session XP with and without a program', () => {
  it('awards the same XP, levels and derived set columns whether or not the session follows a program', async () => {
    const freestyle = await createTestUser();
    const follower = await createTestUser();
    const enrollmentId = await enrollInMadcow(follower);
    const startedAt = hoursAgo(1);
    const sets = mondaySquatSets();
    const freestylePayload = payloadAt(startedAt, sets.map(withoutPrescription));
    const programPayload = linkedPayload(
      sets.map((set) => ({ ...set, id: randomUUID() })),
      { enrollmentId, position: MONDAY_WEEK_1 },
      startedAt,
    );
    const unlinked = await postCompleteSession(freestyle.accessToken, freestylePayload);
    const linked = await postCompleteSession(follower.accessToken, programPayload);

    expect(unlinked.status, unlinked.rawBody).toBe(200);
    expect(linked.status, linked.rawBody).toBe(200);
    expect(linked.body.programLinked).toBe(true);
    expect(linked.body.xpBySkill).toEqual(unlinked.body.xpBySkill);
    expect(linked.body.levelUps).toEqual(unlinked.body.levelUps);
    const [linkedState, unlinkedState] = await Promise.all([
      normalizedSnapshot(follower.id),
      normalizedSnapshot(freestyle.id),
    ]);
    expect(linkedState.sets).toEqual(unlinkedState.sets);
    expect(linkedState.userSkills).toEqual(unlinkedState.userSkills);
    expect(linkedState.exerciseMaxes).toEqual(unlinkedState.exerciseMaxes);
  });
});

describe('enrollment_facts', () => {
  it('returns the enrollment, its events and each linked session with its lift sets', async () => {
    const user = await createTestUser();
    const enrollmentId = await enrollInMadcow(user);
    const adjusted = await user.client.rpc('adjust_enrollment', {
      enrollment_id: enrollmentId,
      event: { kind: 'set_reference', lift: 'squat', var: 'top', value: 95 },
    });
    expect(adjusted.error).toBeNull();
    const topSet = {
      ...squatSet(1, 102.5, prescribed('mon-squat:4', 100, 5, { amrap: true, minReps: 5 }), 7),
      effort: { type: 'rpe', value: 8 },
    };
    const payload = linkedPayload(
      [
        squatSet(0, 80, prescribed('mon-squat:0', 80)),
        topSet,
        squatSet(2, 50, null, 10),
        aBout(exerciseIds.running, 3),
      ],
      { enrollmentId, position: MONDAY_WEEK_1 },
    );
    const response = await postCompleteSession(user.accessToken, payload);
    expect(response.status, response.rawBody).toBe(200);

    const facts = await linkedFacts(user, enrollmentId);

    expect(facts.enrollment).toMatchObject({
      id: enrollmentId,
      template_key: 'madcow_5x5',
      template_version: 2,
      unit: 'kg',
      options: { rampStep: 0.125 },
      lift_bindings: madcowBindings(),
      rounding: { increment: 2.5, mode: 'nearest', barWeight: 20 },
      ended_at: null,
    });
    expect(facts.events).toEqual([
      {
        id: adjusted.data,
        kind: 'set_reference',
        payload: { lift: 'squat', var: 'top', value: 95 },
        effective_at: expect.any(String),
      },
    ]);
    expect(facts.sessions).toHaveLength(1);
    const [session] = facts.sessions;
    expect(session.id).toBe(payload.id);
    expect(Date.parse(session.completed_at)).toBe(Date.parse(response.body.completedAt!));
    expect(session.program_position).toEqual(MONDAY_WEEK_1);
    expect(session.sets).toEqual([
      {
        ref: 'mon-squat:0',
        exercise_id: exerciseIds.back_squat,
        weight_kg: 80,
        reps: 5,
        effort_input_type: 'rir',
        effort_value: 2,
        prescribed_weight_kg: 80,
        prescribed_reps: 5,
        prescribed_min_reps: null,
        prescribed_amrap: false,
      },
      {
        ref: 'mon-squat:4',
        exercise_id: exerciseIds.back_squat,
        weight_kg: 102.5,
        reps: 7,
        effort_input_type: 'rpe',
        effort_value: 8,
        prescribed_weight_kg: 100,
        prescribed_reps: 5,
        prescribed_min_reps: 5,
        prescribed_amrap: true,
      },
      {
        ref: null,
        exercise_id: exerciseIds.back_squat,
        weight_kg: 50,
        reps: 10,
        effort_input_type: 'rir',
        effort_value: 2,
        prescribed_weight_kg: null,
        prescribed_reps: null,
        prescribed_min_reps: null,
        prescribed_amrap: null,
      },
    ]);
  });

  it('lists only the linked sessions, oldest completion first', async () => {
    const user = await createTestUser();
    const enrollmentId = await enrollInMadcow(user);
    const monday = linkedPayload(mondaySquatSets(), { enrollmentId, position: MONDAY_WEEK_1 }, hoursAgo(5));
    const freestyle = linkedPayload(mondaySquatSets(), null, hoursAgo(4));
    const wednesday = linkedPayload(
      mondaySquatSets(),
      { enrollmentId, position: { week: 1, day: 'wed' } },
      hoursAgo(3),
    );
    for (const payload of [wednesday, freestyle, monday]) {
      const response = await postCompleteSession(user.accessToken, payload);
      expect(response.status, response.rawBody).toBe(200);
    }

    const facts = await linkedFacts(user, enrollmentId);

    expect(facts.sessions.map((session) => session.id)).toEqual([wednesday.id, monday.id]);
  });

  it('gives another user no facts', async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    const enrollmentId = await enrollInMadcow(owner);
    const payload = linkedPayload(mondaySquatSets(), { enrollmentId, position: MONDAY_WEEK_1 });
    expect((await postCompleteSession(owner.accessToken, payload)).status).toBe(200);

    const result = await factsOf(other, enrollmentId);

    expect(result.error).toBeNull();
    expect(result.data).toBeNull();
  });

  it('drops a session from the facts once delete-session removes it', async () => {
    const user = await createTestUser();
    const enrollmentId = await enrollInMadcow(user);
    const kept = linkedPayload(mondaySquatSets(), { enrollmentId, position: MONDAY_WEEK_1 }, hoursAgo(3));
    const removed = linkedPayload(mondaySquatSets(), { enrollmentId, position: { week: 1, day: 'wed' } });
    for (const payload of [kept, removed])
      expect((await postCompleteSession(user.accessToken, payload)).status).toBe(200);

    const deleted = await postFunction('delete-session', user.accessToken, { sessionId: removed.id });

    expect(deleted.status, deleted.rawBody).toBe(200);
    expect((await linkedFacts(user, enrollmentId)).sessions.map((session) => session.id)).toEqual([kept.id]);
  });
});

describe('edit-session of a linked session', () => {
  async function linkedSession(user: TestUser) {
    const enrollmentId = await enrollInMadcow(user);
    const sets = mondaySquatSets();
    const payload = linkedPayload(sets, { enrollmentId, position: MONDAY_WEEK_1 });
    const response = await postCompleteSession(user.accessToken, payload);
    expect(response.status, response.rawBody).toBe(200);
    return { payload, sets };
  }

  it('keeps the stored snapshots of kept sets that the edit sends without a prescription', async () => {
    const user = await createTestUser();
    const { payload, sets } = await linkedSession(user);
    const before = await snapshotsOf(payload.id);

    const response = await edit(
      user,
      payload.id,
      sets.map((set) => ({ ...withoutPrescription(set), reps: 4 })),
    );

    expect(response.status, response.rawBody).toBe(200);
    expect(await snapshotsOf(payload.id)).toEqual(before);
  });

  it('ignores a changed prescription on a kept set instead of rejecting the edit', async () => {
    const user = await createTestUser();
    const { payload, sets } = await linkedSession(user);
    const before = await snapshotsOf(payload.id);
    const [first, ...rest] = sets;

    const response = await edit(user, payload.id, [
      { ...first, prescription: prescribed('mon-squat:9', 200, 1, { amrap: true }) },
      ...rest,
    ]);

    expect(response.status, response.rawBody).toBe(200);
    expect(await snapshotsOf(payload.id)).toEqual(before);
  });

  it('stores the snapshot of an added set whose ref is new to the session', async () => {
    const user = await createTestUser();
    const { payload, sets } = await linkedSession(user);

    const response = await edit(user, payload.id, [...sets, squatSet(3, 90, prescribed('mon-squat:3', 90))]);

    expect(response.status, response.rawBody).toBe(200);
    expect((await snapshotsOf(payload.id))[3]).toEqual({
      position: 3,
      prescription_ref: 'mon-squat:3',
      prescribed_weight_kg: 90,
      prescribed_reps: 5,
      prescribed_min_reps: null,
      prescribed_amrap: false,
    });
  });

  it("stores an added set without a prescription when its ref is a kept set's stored ref", async () => {
    const user = await createTestUser();
    const { payload, sets } = await linkedSession(user);

    const response = await edit(user, payload.id, [...sets, squatSet(3, 90, prescribed('mon-squat:0', 90))]);

    expect(response.status, response.rawBody).toBe(200);
    const snapshots = await snapshotsOf(payload.id);
    expect(snapshots[3]).toEqual(noSnapshot(3));
    expect(snapshots[0]).toMatchObject({ prescription_ref: 'mon-squat:0', prescribed_weight_kg: 60 });
  });

  it('stores an added set under the ref of a set the same edit removes', async () => {
    const user = await createTestUser();
    const { payload, sets } = await linkedSession(user);
    const [, second, third] = sets;

    const response = await edit(user, payload.id, [
      { ...second, position: 1 },
      { ...third, position: 2 },
      squatSet(0, 65, prescribed('mon-squat:0', 65)),
    ]);

    expect(response.status, response.rawBody).toBe(200);
    expect((await snapshotsOf(payload.id))[0]).toMatchObject({
      prescription_ref: 'mon-squat:0',
      prescribed_weight_kg: 65,
    });
  });

  it.each([
    ['without the amrap flag', { ref: 'mon-squat:3', weightKg: 90, reps: 5 }],
    ['with a ref longer than 100 characters', { ref: 'x'.repeat(101), weightKg: 90, reps: 5, amrap: false }],
    ['with fractional reps', { ref: 'mon-squat:3', weightKg: 90, reps: 4.5, amrap: false }],
    ['with an unknown key', { ref: 'mon-squat:3', weightKg: 90, reps: 5, amrap: false, pct: 0.8 }],
    ['that is not an object', 'mon-squat:3'],
  ])('returns 422 invalid_payload for an edit with a prescription %s', async (_, malformed) => {
    const user = await createTestUser();
    const { payload, sets } = await linkedSession(user);

    const response = await edit(user, payload.id, [...sets, { ...squatSet(3, 90, null), prescription: malformed }]);

    expect(response.status, response.rawBody).toBe(422);
    expect(response.body.error).toBe('invalid_payload');
  });

  it('returns 422 duplicate_prescription_ref when the edit carries one ref twice', async () => {
    const user = await createTestUser();
    const { payload, sets } = await linkedSession(user);

    const response = await edit(user, payload.id, [
      ...sets,
      squatSet(3, 90, prescribed('mon-squat:7', 90)),
      squatSet(4, 90, prescribed('mon-squat:7', 90)),
    ]);

    expect(response.status, response.rawBody).toBe(422);
    expect(response.body.error).toBe('duplicate_prescription_ref');
  });
});

describe('edit-session of an unlinked session', () => {
  it('stores an added set without a prescription, since the session follows no program', async () => {
    const user = await createTestUser();
    const sets = mondaySquatSets().map(withoutPrescription);
    const payload = linkedPayload(sets, null);
    expect((await postCompleteSession(user.accessToken, payload)).status).toBe(200);

    const response = await edit(user, payload.id, [...sets, squatSet(3, 90, prescribed('mon-squat:3', 90))]);

    expect(response.status, response.rawBody).toBe(200);
    expect(await snapshotsOf(payload.id)).toEqual([0, 1, 2, 3].map(noSnapshot));
  });
});

describe('complete-session following a custom program snapshot', () => {
  const START_KG = 100;

  async function followFiveByFive(
    user: TestUser,
    liftId = exerciseIds.back_squat,
  ): Promise<{ enrollmentId: string; liftKey: string }> {
    const programId = await savedProgram(user, {
      id: randomUUID(),
      name: '5x5',
      days: [plannedDay('Lift day', [linearFiveByFive(liftId)])],
    });
    const template = await publishedProgram(user, programId);
    const liftKey = customLiftKey(liftId);
    const result = await user.client.rpc('enroll_program', {
      enrollment: {
        templateKey: template.key,
        templateVersion: template.version,
        unit: 'kg',
        options: {},
        bindings: { [liftKey]: liftId },
        inputs: { [liftKey]: { workingWeight: START_KG } },
        rounding: { increment: 2.5, mode: 'nearest', barWeight: 20 },
      },
    });
    expect(result.error).toBeNull();
    return { enrollmentId: result.data as string, liftKey };
  }

  function fiveByFive(weightKg: number, repsBySet = [5, 5, 5, 5, 5]): ProgramSetBody[] {
    return repsBySet.map((reps, index) => squatSet(index, weightKg, prescribed(`d0_0:${index}`, weightKg), reps));
  }

  async function completeLinked(user: TestUser, enrollmentId: string, index: number, sets: ProgramSetBody[]) {
    const payload = linkedPayload(sets, { enrollmentId, position: { index } }, hoursAgo(3 - index));
    const response = await postCompleteSession(user.accessToken, payload);
    expect(response.status, response.rawBody).toBe(200);
    expect(response.body.programLinked).toBe(true);
  }

  async function workingWeightOf(user: TestUser, enrollmentId: string, liftKey: string): Promise<number | undefined> {
    const facts = await linkedFacts(user, enrollmentId);
    const { data, error } = await user.client
      .from('program_templates')
      .select('definition')
      .eq('key', facts.enrollment.template_key as string)
      .eq('version', facts.enrollment.template_version as number)
      .single();
    expect(error).toBeNull();
    const rows = facts as unknown as EnrollmentFactsRows;
    const state = programStateAt(
      data?.definition as ProgramDefinition,
      enrollmentFromRow(rows.enrollment),
      programFactsFromRows(rows),
    );
    return state.refs[liftKey]?.workingWeight;
  }

  it('moves the working weight up by the increment after a met 5x5 and holds it after a miss', async () => {
    const user = await createTestUser();
    const { enrollmentId, liftKey } = await followFiveByFive(user);
    expect(await workingWeightOf(user, enrollmentId, liftKey)).toBe(START_KG);

    await completeLinked(user, enrollmentId, 0, fiveByFive(START_KG));
    expect(await workingWeightOf(user, enrollmentId, liftKey)).toBe(102.5);

    await completeLinked(user, enrollmentId, 1, fiveByFive(102.5, [5, 5, 5, 4, 3]));
    expect(await workingWeightOf(user, enrollmentId, liftKey)).toBe(102.5);
  });

  async function lootRollsBySet(userId: string) {
    const { lootRolls } = await lootSnapshot(userId);
    return lootRolls.map((roll) => [roll.kind, roll.roll_index, roll.drop_table_id]).sort();
  }

  it('awards the same XP, levels, derived set columns and loot rolls as the same sets with no program', async () => {
    const freestyle = await createTestUser();
    const follower = await createTestUser();
    const { enrollmentId } = await followFiveByFive(follower);
    const startedAt = hoursAgo(1);
    const sets = fiveByFive(START_KG);
    const unlinked = await postCompleteSession(
      freestyle.accessToken,
      payloadAt(startedAt, sets.map(withoutPrescription)),
    );
    const linked = await postCompleteSession(
      follower.accessToken,
      linkedPayload(
        sets.map((set) => ({ ...set, id: randomUUID() })),
        { enrollmentId, position: { index: 0 } },
        startedAt,
      ),
    );

    expect(unlinked.status, unlinked.rawBody).toBe(200);
    expect(linked.status, linked.rawBody).toBe(200);
    expect(linked.body.programLinked).toBe(true);
    expect(linked.body.xpBySkill).toEqual(unlinked.body.xpBySkill);
    expect(linked.body.levelUps).toEqual(unlinked.body.levelUps);
    const [linkedState, unlinkedState] = await Promise.all([
      normalizedSnapshot(follower.id),
      normalizedSnapshot(freestyle.id),
    ]);
    expect(linkedState.sets).toEqual(unlinkedState.sets);
    expect(linkedState.userSkills).toEqual(unlinkedState.userSkills);
    expect(linkedState.exerciseMaxes).toEqual(unlinkedState.exerciseMaxes);
    const [linkedRolls, unlinkedRolls] = await Promise.all([lootRollsBySet(follower.id), lootRollsBySet(freestyle.id)]);
    expect(linkedRolls.length).toBeGreaterThan(0);
    expect(linkedRolls).toEqual(unlinkedRolls);
  });

  it('awards Grip XP for a deadlift planned in your own program, from its grip share', async () => {
    const user = await createTestUser();
    const { enrollmentId } = await followFiveByFive(user, exerciseIds.deadlift);
    const deadliftSets = fiveByFive(START_KG).map((set) => ({ ...set, exerciseId: exerciseIds.deadlift }));
    const response = await postCompleteSession(
      user.accessToken,
      linkedPayload(deadliftSets, { enrollmentId, position: { index: 0 } }),
    );

    expect(response.status, response.rawBody).toBe(200);
    expect(response.body.programLinked).toBe(true);
    const xpBySkill = response.body.xpBySkill ?? {};
    expect(xpBySkill.grip).toBeGreaterThan(0);
    expect(xpBySkill.grip).toBeLessThan(xpBySkill.back);
  });
});
