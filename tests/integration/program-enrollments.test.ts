import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  isPositionInSchedule,
  parseProgramDefinition,
  type Position,
  type ProgramDefinition,
  type ProgramEnrollment,
} from '@domain/index.ts';
import { validateEnrollment } from '@domain/program-definition.ts';
import { FIVE_THREE_ONE } from '../domain/program-fixtures/five_three_one.ts';
import { GZCLP } from '../domain/program-fixtures/gzclp.ts';
import { JUGGERNAUT_2 } from '../domain/program-fixtures/juggernaut_2.ts';
import { MADCOW_5X5 } from '../domain/program-fixtures/madcow_5x5.ts';
import {
  anon,
  builtInExerciseId,
  createTestUser,
  databaseNow,
  db,
  postFunction,
  rateLimitHits,
  seedRateLimitHits,
  TEST_PASSWORD,
  type TestUser,
} from './local-stack.ts';
import {
  customLiftKey,
  customTemplateKey,
  linearFiveByFive,
  plannedDay,
  type ProgramDoc,
  publishedProgram,
  publishProgram,
  type PublishedTemplate,
  savedProgram,
} from './program-support.ts';
import { createCustomExercise } from './session-support.ts';
import type { ProgramTemplateRow } from '../../web/src/lib/program-enroll-rules.ts';
import type { EnrollmentRow } from '../../web/src/lib/program-facts-rules.ts';
import { followStatus } from '../../web/src/lib/program-follow-rules.ts';
import { PROGRAM_SELECT, programPayload, type ProgramRow, toProgram } from '../../web/src/lib/program-row-rules.ts';
import type { ProgramDoc as WebProgramDoc } from '../../web/src/lib/programs.ts';
import type { PlannedProgression } from '../../web/src/offline/draft-format.ts';

interface EnrollmentPayload {
  templateKey: string;
  templateVersion: number;
  unit: string;
  options: Record<string, unknown>;
  bindings: Record<string, unknown>;
  inputs: Record<string, Record<string, unknown>>;
  rounding: Record<string, unknown>;
}

interface RpcResult {
  data: unknown;
  error: { code?: string; message?: string } | null;
}

interface ExportedEnrollments {
  programEnrollments: { id: string; template_key: string; ended_at: string | null }[];
  programEnrollmentEvents: { id: string; enrollment_id: string; kind: string; payload: unknown }[];
}

const ROTATION_TEMPLATE_KEY = `it_rotation_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const ROTATION_TEMPLATE: ProgramDefinition = { ...structuredClone(GZCLP), key: ROTATION_TEMPLATE_KEY, version: 1 };

const UNIT_ONLY_TEMPLATE_KEY = `it_unit_only_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const UNIT_ONLY_TEMPLATE: ProgramDefinition = { ...structuredClone(JUGGERNAUT_2), key: UNIT_ONLY_TEMPLATE_KEY };

const UNPUBLISHED_VERSION = 99;

const KG_ROUNDING = { increment: 2.5, mode: 'nearest', barWeight: 20 };

let exerciseIds: Record<string, string>;

beforeAll(async () => {
  const keys = ['back_squat', 'barbell_bench_press', 'barbell_row', 'overhead_press', 'deadlift'];
  exerciseIds = Object.fromEntries(await Promise.all(keys.map(async (key) => [key, await builtInExerciseId(key)])));
  await db`
    insert into public.program_templates (key, version, name, definition)
    values (${ROTATION_TEMPLATE_KEY}, 1, 'Rotation test template', ${db.json(JSON.parse(JSON.stringify(ROTATION_TEMPLATE)))})`;
  await db`
    insert into public.program_templates (key, version, name, definition)
    values (${UNIT_ONLY_TEMPLATE_KEY}, 1, 'Unit-only option test template', ${db.json(JSON.parse(JSON.stringify(UNIT_ONLY_TEMPLATE)))})`;
});

afterAll(async () => {
  await db`delete from public.program_enrollments where template_key = ${ROTATION_TEMPLATE_KEY}`;
  await db`delete from public.program_templates where key = ${ROTATION_TEMPLATE_KEY}`;
  await db`delete from public.program_enrollments where template_key = ${UNIT_ONLY_TEMPLATE_KEY}`;
  await db`delete from public.program_templates where key = ${UNIT_ONLY_TEMPLATE_KEY}`;
  await db.end();
});

function madcowPayload(): EnrollmentPayload {
  return {
    templateKey: 'madcow_5x5',
    templateVersion: MADCOW_5X5.version,
    unit: 'kg',
    options: { rampStep: 0.125 },
    bindings: {
      squat: exerciseIds.back_squat,
      bench: exerciseIds.barbell_bench_press,
      row: exerciseIds.barbell_row,
      press: exerciseIds.overhead_press,
      deadlift: exerciseIds.deadlift,
      hyper: null,
    },
    inputs: {
      squat: { fiveRm: 100 },
      bench: { fiveRm: 80 },
      row: { fiveRm: 70 },
      press: { fiveRm: 50 },
      deadlift: { fiveRm: 140 },
    },
    rounding: { ...KG_ROUNDING },
  };
}

function fiveThreeOnePayload(): EnrollmentPayload {
  return {
    templateKey: 'five_three_one',
    templateVersion: FIVE_THREE_ONE.version,
    unit: 'lb',
    options: { supplemental: 'bbb', bbbPct: 0.5 },
    bindings: {
      squat: exerciseIds.back_squat,
      bench: exerciseIds.barbell_bench_press,
      deadlift: exerciseIds.deadlift,
      press: exerciseIds.overhead_press,
    },
    inputs: { squat: { tm: 300 }, bench: { oneRm: 245 }, deadlift: { tm: 400 }, press: { tm: 135 } },
    rounding: { increment: 5, mode: 'nearest', barWeight: 45 },
  };
}

function rotationPayload(): EnrollmentPayload {
  return {
    templateKey: ROTATION_TEMPLATE_KEY,
    templateVersion: 1,
    unit: 'kg',
    options: {},
    bindings: {},
    inputs: Object.fromEntries(ROTATION_TEMPLATE.lifts.map((lift) => [lift.key, { workingWeight: 40 }])),
    rounding: { ...KG_ROUNDING },
  };
}

function unitOnlyPayload(unit: 'kg' | 'lb', perRep: string): EnrollmentPayload {
  return {
    templateKey: UNIT_ONLY_TEMPLATE_KEY,
    templateVersion: 1,
    unit,
    options: { perRep },
    bindings: {},
    inputs: Object.fromEntries(UNIT_ONLY_TEMPLATE.lifts.map((lift) => [lift.key, { tm: 100 }])),
    rounding: unit === 'kg' ? { ...KG_ROUNDING } : { increment: 5, mode: 'nearest', barWeight: 45 },
  };
}

async function enroll(user: TestUser, enrollment: unknown): Promise<RpcResult> {
  return await user.client.rpc('enroll_program', { enrollment });
}

async function enrolled(user: TestUser, enrollment: EnrollmentPayload): Promise<string> {
  const result = await enroll(user, enrollment);
  expect(result.error).toBeNull();
  expect(typeof result.data).toBe('string');
  return result.data as string;
}

async function adjust(user: TestUser, enrollmentId: string, event: unknown): Promise<RpcResult> {
  return await user.client.rpc('adjust_enrollment', { enrollment_id: enrollmentId, event });
}

async function endEnrollment(user: TestUser, enrollmentId: string): Promise<RpcResult> {
  return await user.client.rpc('end_enrollment', { enrollment_id: enrollmentId });
}

function expectRefused(result: RpcResult, message: string): void {
  expect(result.data ?? null).toBeNull();
  expect(result.error?.code).toBe('P0001');
  expect(result.error?.message).toBe(message);
}

function expectRateLimited(result: RpcResult): void {
  expect(result.error?.code).toBe('PT429');
  expect(result.error?.message).toBe('rate_limited');
}

async function enrollmentRows(userId: string) {
  return await db`
    select id, user_id, template_key, template_version, unit, options, lift_bindings, inputs, rounding,
           started_at, ended_at
    from public.program_enrollments where user_id = ${userId} order by started_at, id`;
}

async function activeEnrollmentIds(userId: string): Promise<string[]> {
  const rows = await db`
    select id from public.program_enrollments where user_id = ${userId} and ended_at is null`;
  return rows.map((row) => row.id as string);
}

async function eventRows(enrollmentId: string) {
  return await db`
    select id, kind, payload, effective_at from public.program_enrollment_events
    where enrollment_id = ${enrollmentId} order by effective_at, id`;
}

describe('program_templates', () => {
  it.each([
    ['madcow_5x5', 'Madcow 5x5', MADCOW_5X5],
    ['five_three_one', '5/3/1', FIVE_THREE_ONE],
  ] as const)('serves the seeded %s definition exactly as the domain fixture', async (key, name, fixture) => {
    const user = await createTestUser();
    const { data, error } = await user.client
      .from('program_templates')
      .select('key, version, name, definition')
      .eq('key', key)
      .eq('version', fixture.version)
      .single();
    expect(error).toBeNull();
    expect(data).toEqual({ key, version: fixture.version, name, definition: JSON.parse(JSON.stringify(fixture)) });
  });

  it('refuses a template written by a client', async () => {
    const user = await createTestUser();
    const { error } = await user.client
      .from('program_templates')
      .insert({ key: 'client_template', version: 1, name: 'Client', definition: {} });
    expect(error?.code).toBe('42501');
  });
});

describe('enroll_program', () => {
  let refusedUser: TestUser;

  beforeAll(async () => {
    refusedUser = await createTestUser();
  });

  it('stores a Madcow enrollment as sent and starts it now', async () => {
    const user = await createTestUser();
    const before = await databaseNow();
    const payload = madcowPayload();
    const enrollmentId = await enrolled(user, payload);
    const after = await databaseNow();
    const [row] = await enrollmentRows(user.id);
    expect(row).toMatchObject({
      id: enrollmentId,
      user_id: user.id,
      template_key: 'madcow_5x5',
      template_version: MADCOW_5X5.version,
      unit: 'kg',
      options: payload.options,
      lift_bindings: payload.bindings,
      inputs: payload.inputs,
      rounding: payload.rounding,
      ended_at: null,
    });
    expect((row.started_at as Date).getTime()).toBeGreaterThanOrEqual(before);
    expect((row.started_at as Date).getTime()).toBeLessThanOrEqual(after);
  });

  it('accepts a 5/3/1 enrollment in lb that mixes TM and 1RM inputs', async () => {
    const user = await createTestUser();
    await enrolled(user, fiveThreeOnePayload());
    const [row] = await enrollmentRows(user.id);
    expect(row.unit).toBe('lb');
    expect(row.inputs).toEqual(fiveThreeOnePayload().inputs);
  });

  it("accepts the user's own custom exercise bound to a lift", async () => {
    const user = await createTestUser();
    const customId = await createCustomExercise(user, { skillKey: 'back' });
    const payload = madcowPayload();
    payload.bindings.row = customId;
    await enrolled(user, payload);
    const [row] = await enrollmentRows(user.id);
    expect((row.lift_bindings as Record<string, string>).row).toBe(customId);
  });

  it.each<[string, (payload: EnrollmentPayload) => void, string]>([
    ['an unknown template', (p) => (p.templateKey = 'madcow_6x6'), 'unknown_template'],
    ['an unknown template version', (p) => (p.templateVersion = UNPUBLISHED_VERSION), 'unknown_template'],
    ['a lift without an input', (p) => delete p.inputs.deadlift, 'invalid_enrollment'],
    ['an input kind the template does not take', (p) => (p.inputs.squat = { oneRm: 120 }), 'invalid_enrollment'],
    ['an input of zero', (p) => (p.inputs.squat = { fiveRm: 0 }), 'invalid_enrollment'],
    ['a negative input', (p) => (p.inputs.bench = { fiveRm: -80 }), 'invalid_enrollment'],
    ['an input that is not a number', (p) => (p.inputs.row = { fiveRm: '70' }), 'invalid_enrollment'],
    ['an option the template does not define', (p) => (p.options.deloadPct = 0.1), 'invalid_enrollment'],
    ['an option value outside its choices', (p) => (p.options.rampStep = 0.2), 'invalid_enrollment'],
    ['a binding for a lift the template does not define', (p) => (p.bindings.lunge = null), 'invalid_enrollment'],
    ['a binding that is not an id', (p) => (p.bindings.squat = 'back_squat'), 'invalid_enrollment'],
    ['a unit other than kg or lb', (p) => (p.unit = 'stone'), 'invalid_enrollment'],
    ['a rounding increment of zero', (p) => (p.rounding.increment = 0), 'invalid_enrollment'],
    ['an unknown rounding mode', (p) => (p.rounding.mode = 'up'), 'invalid_enrollment'],
    ['an exercise that does not exist', (p) => (p.bindings.squat = randomUUID()), 'unknown_exercise'],
  ])('refuses %s and stores nothing', async (_case, mutate, message) => {
    const payload = madcowPayload();
    mutate(payload);
    expectRefused(await enroll(refusedUser, payload), message);
    expect(await enrollmentRows(refusedUser.id)).toHaveLength(0);
  });

  it.each<[string, (payload: EnrollmentPayload) => void]>([
    ['an input for a lift that takes none (hyper)', (p) => (p.inputs.hyper = { fiveRm: 20 })],
    ['an input for a lift the template does not define', (p) => (p.inputs.lunge = { fiveRm: 60 })],
    ['an input above 1000', (p) => (p.inputs.deadlift = { fiveRm: 1000.5 })],
  ])('refuses %s and stores nothing', async (_case, mutate) => {
    const user = await createTestUser();
    const payload = madcowPayload();
    mutate(payload);
    expectRefused(await enroll(user, payload), 'invalid_enrollment');
    expect(await enrollmentRows(user.id)).toHaveLength(0);
  });

  it('refuses a choice value offered only for lb in a kg enrollment (Juggernaut perRep fine) and stores nothing', async () => {
    const user = await createTestUser();
    expectRefused(await enroll(user, unitOnlyPayload('kg', 'fine')), 'invalid_enrollment');
    expect(await enrollmentRows(user.id)).toHaveLength(0);
  });

  it.each<['kg' | 'lb', string]>([
    ['lb', 'fine'],
    ['kg', 'standard'],
  ])('accepts a %s enrollment with perRep %s', async (unit, perRep) => {
    await enrolled(await createTestUser(), unitOnlyPayload(unit, perRep));
  });

  it('accepts an input of exactly 1000', async () => {
    const user = await createTestUser();
    const payload = madcowPayload();
    payload.inputs.deadlift = { fiveRm: 1000 };
    await enrolled(user, payload);
  });

  it('accepts an lb input of 2205, the 1000 kg cap in pounds', async () => {
    const user = await createTestUser();
    const payload = fiveThreeOnePayload();
    payload.inputs.deadlift = { tm: 2205 };
    await enrolled(user, payload);
  });

  it('refuses an lb input above 2205 and stores nothing', async () => {
    const user = await createTestUser();
    const payload = fiveThreeOnePayload();
    payload.inputs.deadlift = { tm: 2205.5 };
    expectRefused(await enroll(user, payload), 'invalid_enrollment');
    expect(await enrollmentRows(user.id)).toHaveLength(0);
  });

  it('stores only increment, mode and barWeight of the rounding', async () => {
    const user = await createTestUser();
    const payload = madcowPayload();
    payload.rounding = { ...KG_ROUNDING, plates: [25, 20, 10], note: 'home gym' };
    await enrolled(user, payload);
    const [row] = await enrollmentRows(user.id);
    expect(row.rounding).toEqual(KG_ROUNDING);
  });

  it('refuses a payload that is not an object', async () => {
    expectRefused(await enroll(refusedUser, 'madcow_5x5'), 'invalid_enrollment');
    expect(await enrollmentRows(refusedUser.id)).toHaveLength(0);
  });

  it("refuses another user's custom exercise", async () => {
    const owner = await createTestUser();
    const foreignId = await createCustomExercise(owner, { skillKey: 'back' });
    const payload = madcowPayload();
    payload.bindings.row = foreignId;
    expectRefused(await enroll(refusedUser, payload), 'unknown_exercise');
    expect(await enrollmentRows(refusedUser.id)).toHaveLength(0);
  });

  it('refuses a caller who is not signed in', async () => {
    const { error } = await anon.rpc('enroll_program', { enrollment: madcowPayload() });
    expect(error?.code).toBe('42501');
  });
});

describe('re-enrolling', () => {
  it('ends the previous enrollment and starts the new one', async () => {
    const user = await createTestUser();
    const first = await enrolled(user, madcowPayload());
    const second = await enrolled(user, fiveThreeOnePayload());
    const [ended, started] = await enrollmentRows(user.id);
    expect(ended.id).toBe(first);
    expect(ended.ended_at).not.toBeNull();
    expect(started.id).toBe(second);
    expect(started.ended_at).toBeNull();
    expect((ended.ended_at as Date).getTime()).toBeLessThanOrEqual((started.started_at as Date).getTime());
    expect(await activeEnrollmentIds(user.id)).toEqual([second]);
  });

  it('leaves the active enrollment running when the new one is refused', async () => {
    const user = await createTestUser();
    const active = await enrolled(user, madcowPayload());
    const refused = fiveThreeOnePayload();
    delete refused.inputs.press;
    expectRefused(await enroll(user, refused), 'invalid_enrollment');
    expect(await activeEnrollmentIds(user.id)).toEqual([active]);
  });
});

describe('adjust_enrollment', () => {
  let madcowUser: TestUser;
  let madcowId: string;
  let cycleUser: TestUser;
  let cycleId: string;
  let rotationUser: TestUser;
  let rotationId: string;

  beforeAll(async () => {
    [madcowUser, cycleUser, rotationUser] = await Promise.all([createTestUser(), createTestUser(), createTestUser()]);
    madcowId = await enrolled(madcowUser, madcowPayload());
    cycleId = await enrolled(cycleUser, fiveThreeOnePayload());
    rotationId = await enrolled(rotationUser, rotationPayload());
  });

  it('stores a set_reference stamped with the server time, ignoring a time sent by the client', async () => {
    const before = await databaseNow();
    const result = await adjust(madcowUser, madcowId, {
      kind: 'set_reference',
      lift: 'squat',
      var: 'top',
      value: 90.37,
      effectiveAt: '2020-01-01T00:00:00.000Z',
    });
    const after = await databaseNow();
    expect(result.error).toBeNull();
    const [row] = (await eventRows(madcowId)).filter((event) => event.id === result.data);
    expect(row.kind).toBe('set_reference');
    expect(row.payload).toEqual({ lift: 'squat', var: 'top', value: 90.37 });
    expect((row.effective_at as Date).getTime()).toBeGreaterThanOrEqual(before);
    expect((row.effective_at as Date).getTime()).toBeLessThanOrEqual(after);
  });

  it('accepts a reference of exactly 1000', async () => {
    const result = await adjust(madcowUser, madcowId, {
      kind: 'set_reference',
      lift: 'deadlift',
      var: 'top',
      value: 1000,
    });
    expect(result.error).toBeNull();
  });

  it('accepts a tm reference on 5/3/1, which declares tm', async () => {
    const result = await adjust(cycleUser, cycleId, { kind: 'set_reference', lift: 'press', var: 'tm', value: 140 });
    expect(result.error).toBeNull();
  });

  it.each<[string, Record<string, unknown>]>([
    ['tm, which Madcow does not declare', { lift: 'squat', var: 'tm', value: 100 }],
    ['fiveRm, which is an input and not a reference', { lift: 'squat', var: 'fiveRm', value: 100 }],
    ['a lift the template does not define', { lift: 'lunge', var: 'top', value: 20 }],
    ['a lift that takes no input (hyper)', { lift: 'hyper', var: 'top', value: 40 }],
    ['a value of zero', { lift: 'squat', var: 'top', value: 0 }],
    ['a negative value', { lift: 'squat', var: 'top', value: -5 }],
    ['a value above 1000', { lift: 'squat', var: 'top', value: 1000.01 }],
    ['a value that is not a number', { lift: 'squat', var: 'top', value: '90' }],
    ['no value', { lift: 'squat', var: 'top' }],
  ])('refuses a Madcow set_reference with %s', async (_case, fields) => {
    const before = await eventRows(madcowId);
    expectRefused(await adjust(madcowUser, madcowId, { kind: 'set_reference', ...fields }), 'invalid_event');
    expect(await eventRows(madcowId)).toHaveLength(before.length);
  });

  it('accepts an lb reference of 2205 on the lb 5/3/1 enrollment', async () => {
    const result = await adjust(cycleUser, cycleId, {
      kind: 'set_reference',
      lift: 'deadlift',
      var: 'tm',
      value: 2205,
    });
    expect(result.error).toBeNull();
  });

  it('refuses an lb reference above 2205 on the lb 5/3/1 enrollment', async () => {
    const result = await adjust(cycleUser, cycleId, {
      kind: 'set_reference',
      lift: 'deadlift',
      var: 'tm',
      value: 2205.5,
    });
    expectRefused(result, 'invalid_event');
  });

  it('refuses a top reference on 5/3/1, which declares only tm', async () => {
    const result = await adjust(cycleUser, cycleId, { kind: 'set_reference', lift: 'press', var: 'top', value: 140 });
    expectRefused(result, 'invalid_event');
  });

  it('refuses an event kind it does not know', async () => {
    expectRefused(
      await adjust(madcowUser, madcowId, { kind: 'reset', position: { week: 1, day: 'mon' } }),
      'invalid_event',
    );
  });

  it('refuses an event that is not an object', async () => {
    expectRefused(await adjust(madcowUser, madcowId, 'skip'), 'invalid_event');
  });

  describe('positions', () => {
    const enrollments = () => ({
      weekly: { user: madcowUser, id: madcowId },
      cycle: { user: cycleUser, id: cycleId },
      rotation: { user: rotationUser, id: rotationId },
    });

    it.each<['weekly' | 'cycle' | 'rotation', 'skip_day' | 'jump_to', Record<string, unknown>]>([
      ['weekly', 'skip_day', { week: 1, day: 'mon' }],
      ['weekly', 'jump_to', { week: 520, day: 'fri' }],
      ['cycle', 'skip_day', { cycle: 1, week: 1, day: 'squat' }],
      ['cycle', 'jump_to', { cycle: 130, week: 4, day: 'press' }],
      ['rotation', 'skip_day', { index: 0 }],
      ['rotation', 'jump_to', { index: 2079 }],
    ])('stores a %s %s to %o', async (schedule, kind, position) => {
      const { user, id } = enrollments()[schedule];
      const result = await adjust(user, id, { kind, position });
      expect(result.error).toBeNull();
      const [row] = (await eventRows(id)).filter((event) => event.id === result.data);
      expect(row.kind).toBe(kind);
      expect(row.payload).toEqual({ position });
    });

    it.each<['weekly' | 'cycle' | 'rotation', string, Record<string, unknown>]>([
      ['weekly', 'week 521', { week: 521, day: 'mon' }],
      ['weekly', 'week 0', { week: 0, day: 'mon' }],
      ['weekly', 'a fractional week', { week: 1.5, day: 'mon' }],
      ['weekly', 'a day the template does not have', { week: 1, day: 'tue' }],
      ['weekly', 'no day', { week: 1 }],
      ['weekly', 'a cycle position', { cycle: 1, week: 1, day: 'mon' }],
      ['weekly', 'a rotation index', { index: 3 }],
      ['cycle', 'cycle 131', { cycle: 131, week: 1, day: 'squat' }],
      ['cycle', 'cycle 0', { cycle: 0, week: 1, day: 'squat' }],
      ['cycle', 'a week past the end of the cycle', { cycle: 1, week: 5, day: 'squat' }],
      ['cycle', 'week 0', { cycle: 1, week: 0, day: 'squat' }],
      ['cycle', 'a day the template does not have', { cycle: 1, week: 1, day: 'mon' }],
      ['cycle', 'no cycle', { week: 1, day: 'squat' }],
      ['rotation', 'index 2080', { index: 2080 }],
      ['rotation', 'a negative index', { index: -1 }],
      ['rotation', 'a fractional index', { index: 2.5 }],
      ['rotation', 'a weekly position', { week: 1, day: 'a1' }],
    ])('refuses a %s jump_to with %s', async (schedule, _case, position) => {
      const { user, id } = enrollments()[schedule];
      const before = await eventRows(id);
      expectRefused(await adjust(user, id, { kind: 'jump_to', position }), 'invalid_event');
      expectRefused(await adjust(user, id, { kind: 'skip_day', position }), 'invalid_event');
      expect(await eventRows(id)).toHaveLength(before.length);
    });
  });

  it("refuses another user's enrollment", async () => {
    const before = await eventRows(madcowId);
    const result = await adjust(cycleUser, madcowId, { kind: 'set_reference', lift: 'squat', var: 'top', value: 95 });
    expectRefused(result, 'enrollment_not_found');
    expect(await eventRows(madcowId)).toHaveLength(before.length);
  });

  it('refuses an enrollment that does not exist', async () => {
    const result = await adjust(madcowUser, randomUUID(), {
      kind: 'set_reference',
      lift: 'squat',
      var: 'top',
      value: 95,
    });
    expectRefused(result, 'enrollment_not_found');
  });

  it.each<[string, Record<string, unknown>]>([
    ['set_reference', { kind: 'set_reference', lift: 'squat', var: 'top', value: 95 }],
    ['skip_day', { kind: 'skip_day', position: { week: 1, day: 'mon' } }],
    ['jump_to', { kind: 'jump_to', position: { week: 2, day: 'wed' } }],
  ])('refuses a %s on an ended enrollment and stores nothing', async (_kind, event) => {
    const user = await createTestUser();
    const enrollmentId = await enrolled(user, madcowPayload());
    expect((await endEnrollment(user, enrollmentId)).error).toBeNull();
    expectRefused(await adjust(user, enrollmentId, event), 'enrollment_ended');
    expect(await eventRows(enrollmentId)).toHaveLength(0);
  });

  it('refuses an adjustment over the hourly limit and stores nothing', async () => {
    const user = await createTestUser();
    const enrollmentId = await enrolled(user, madcowPayload());
    await seedRateLimitHits('program_adjust_hour', user.id, 60);
    expectRateLimited(
      await adjust(user, enrollmentId, { kind: 'set_reference', lift: 'squat', var: 'top', value: 95 }),
    );
    expect(await eventRows(enrollmentId)).toHaveLength(0);
  });
});

describe('end_enrollment', () => {
  it('ends the active enrollment and lets the user enroll again', async () => {
    const user = await createTestUser();
    const enrollmentId = await enrolled(user, madcowPayload());
    const ended = await endEnrollment(user, enrollmentId);
    expect(ended.error).toBeNull();
    const [row] = await enrollmentRows(user.id);
    expect(row.ended_at).not.toBeNull();
    expect(await activeEnrollmentIds(user.id)).toEqual([]);
    const next = await enrolled(user, fiveThreeOnePayload());
    expect(await activeEnrollmentIds(user.id)).toEqual([next]);
  });

  it("refuses another user's enrollment and leaves it running", async () => {
    const [owner, stranger] = await Promise.all([createTestUser(), createTestUser()]);
    const enrollmentId = await enrolled(owner, madcowPayload());
    expectRefused(await endEnrollment(stranger, enrollmentId), 'enrollment_not_found');
    expect(await activeEnrollmentIds(owner.id)).toEqual([enrollmentId]);
  });
});

describe('the enroll rate limit', () => {
  it('refuses the 11th enrollment in an hour and keeps the active one', async () => {
    const user = await createTestUser();
    await seedRateLimitHits('program_enroll_hour', user.id, 1);
    let lastEnrolled = '';
    for (let enrollment = 2; enrollment <= 10; enrollment += 1) {
      lastEnrolled = await enrolled(user, enrollment % 2 === 0 ? madcowPayload() : fiveThreeOnePayload());
    }
    expect(await rateLimitHits('program_enroll_hour', user.id)).toBe(10);

    expectRateLimited(await enroll(user, madcowPayload()));
    expect(await activeEnrollmentIds(user.id)).toEqual([lastEnrolled]);
    expect(await enrollmentRows(user.id)).toHaveLength(9);
  });

  it('does not count a refused enrollment', async () => {
    const user = await createTestUser();
    const payload = madcowPayload();
    payload.templateVersion = UNPUBLISHED_VERSION;
    expectRefused(await enroll(user, payload), 'unknown_template');
    expect(await rateLimitHits('program_enroll_hour', user.id)).toBe(0);
  });
});

describe('export-data', () => {
  it("exports the caller's enrollments and their events, and nobody else's", async () => {
    const [owner, bystander] = await Promise.all([createTestUser(), createTestUser()]);
    const first = await enrolled(owner, madcowPayload());
    const second = await enrolled(owner, fiveThreeOnePayload());
    const event = await adjust(owner, second, { kind: 'set_reference', lift: 'press', var: 'tm', value: 140 });
    expect(event.error).toBeNull();
    const bystanderEnrollment = await enrolled(bystander, madcowPayload());
    expect(
      (await adjust(bystander, bystanderEnrollment, { kind: 'skip_day', position: { week: 1, day: 'mon' } })).error,
    ).toBeNull();

    const response = await postFunction('export-data', owner.accessToken, {});
    expect(response.status, response.rawBody).toBe(200);
    const exported = response.body as unknown as ExportedEnrollments;
    expect(exported.programEnrollments.map((row) => row.id)).toEqual([first, second]);
    expect(exported.programEnrollments.map((row) => row.ended_at === null)).toEqual([false, true]);
    expect(exported.programEnrollmentEvents).toHaveLength(1);
    expect(exported.programEnrollmentEvents[0]).toMatchObject({
      id: event.data,
      enrollment_id: second,
      kind: 'set_reference',
      payload: { lift: 'press', var: 'tm', value: 140 },
    });
    expect(response.rawBody).not.toContain(bystander.id);
    expect(response.rawBody).not.toContain(bystanderEnrollment);
  });
});

describe('delete-account', () => {
  it('deletes the enrollments and their events with the account', async () => {
    const user = await createTestUser();
    const ended = await enrolled(user, fiveThreeOnePayload());
    const active = await enrolled(user, madcowPayload());
    expect((await adjust(user, active, { kind: 'jump_to', position: { week: 3, day: 'wed' } })).error).toBeNull();

    const response = await postFunction('delete-account', user.accessToken, {
      confirmUsername: user.username,
      password: TEST_PASSWORD,
    });
    expect(response.status, response.rawBody).toBe(200);
    expect(await enrollmentRows(user.id)).toHaveLength(0);
    const [orphans] = await db`
      select count(*)::int as count from public.program_enrollment_events
      where enrollment_id = any(${[ended, active]})`;
    expect(orphans.count).toBe(0);
  });

  it('deletes a followed custom program with its snapshots and enrollment', async () => {
    const user = await createTestUser();
    const squatId = exerciseIds.back_squat;
    const program = {
      id: randomUUID(),
      name: 'Followed squat',
      days: [plannedDay('Day A', [linearFiveByFive(squatId)])],
    };
    const programId = await savedProgram(user, program);
    await publishedProgram(user, programId);
    await savedProgram(user, { ...program, name: 'Followed squat v2' });
    const template = await publishedProgram(user, programId);
    expect(template.version).toBe(2);
    const squat = customLiftKey(squatId);
    const enrollmentId = await enrolled(user, {
      templateKey: template.key,
      templateVersion: template.version,
      unit: 'kg',
      options: {},
      bindings: { [squat]: squatId },
      inputs: { [squat]: { workingWeight: 100 } },
      rounding: { ...KG_ROUNDING },
    });
    expect((await adjust(user, enrollmentId, { kind: 'skip_day', position: { index: 0 } })).error).toBeNull();

    const response = await postFunction('delete-account', user.accessToken, {
      confirmUsername: user.username,
      password: TEST_PASSWORD,
    });

    expect(response.status, response.rawBody).toBe(200);
    expect(await enrollmentRows(user.id)).toHaveLength(0);
    const [left] = await db`
      select
        (select count(*)::int from public.program_templates where key = ${template.key}) as snapshots,
        (select count(*)::int from public.programs where id = ${programId}) as programs,
        (select count(*)::int from public.program_enrollment_events where enrollment_id = ${enrollmentId}) as events`;
    expect(left).toEqual({ snapshots: 0, programs: 0, events: 0 });
  });
});

function cartesianCyclePositions(cycles: number[], weeks: number[], days: string[]): Position[] {
  return cycles.flatMap((cycle) => weeks.flatMap((week) => days.map((day) => ({ cycle, week, day }))));
}

async function positionMismatches(
  user: TestUser,
  enrollmentId: string,
  definition: ProgramDefinition,
  positions: Position[],
) {
  const mismatches: { position: Position; domain: boolean; server: boolean }[] = [];
  for (const position of positions) {
    const domain = isPositionInSchedule(definition, position);
    const result = await adjust(user, enrollmentId, { kind: 'jump_to', position });
    const server = result.error === null;
    if (!server) expectRefused(result, 'invalid_event');
    if (server !== domain) mismatches.push({ position, domain, server });
  }
  return mismatches;
}

describe('adjust_enrollment position bounds match the domain', () => {
  it('accepts exactly the 5/3/1 positions isPositionInSchedule accepts, up to cycle 130', async () => {
    const user = await createTestUser();
    const enrollmentId = await enrolled(user, fiveThreeOnePayload());
    expect(isPositionInSchedule(FIVE_THREE_ONE, { cycle: 130, week: 4, day: 'press' })).toBe(true);
    expect(isPositionInSchedule(FIVE_THREE_ONE, { cycle: 131, week: 1, day: 'squat' })).toBe(false);
    const positions = cartesianCyclePositions([0, 1, 129, 130, 131], [0, 1, 4, 5], ['squat', 'press', 'mon']);
    expect(await positionMismatches(user, enrollmentId, FIVE_THREE_ONE, positions)).toEqual([]);
  });

  it('accepts exactly the rotation positions isPositionInSchedule accepts, below 520 x 4 days', async () => {
    const user = await createTestUser();
    const enrollmentId = await enrolled(user, rotationPayload());
    expect(isPositionInSchedule(ROTATION_TEMPLATE, { index: 2079 })).toBe(true);
    expect(isPositionInSchedule(ROTATION_TEMPLATE, { index: 2080 })).toBe(false);
    const positions: Position[] = [
      ...[-1, 0, 1, 1.5, 2078, 2079, 2080, 2081].map((index) => ({ index })),
      { week: 1, day: 'a1' },
    ];
    expect(await positionMismatches(user, enrollmentId, ROTATION_TEMPLATE, positions)).toEqual([]);
  });
});

describe('publish_program', () => {
  let squatId: string;
  let benchId: string;
  let rowId: string;
  let pullUpId: string;

  beforeAll(async () => {
    [squatId, benchId, rowId, pullUpId] = await Promise.all(
      ['back_squat', 'barbell_bench_press', 'barbell_row', 'pull_up'].map(builtInExerciseId),
    );
  });

  function strengthProgram(): ProgramDoc {
    return {
      id: randomUUID(),
      name: 'Strength A/B',
      days: [
        plannedDay('Day A', [
          linearFiveByFive(squatId),
          { exerciseId: benchId, targetSets: 3, targetRepsMin: 5, targetRepsMax: 5, progression: 'fixed' },
          { exerciseId: rowId, targetSets: 3, targetRepsMin: 8, targetRepsMax: 12 },
        ]),
        plannedDay('Day B', [
          linearFiveByFive(squatId),
          { exerciseId: pullUpId, targetSets: 3, targetRepsMin: 5, targetRepsMax: 10, progression: 'none' },
        ]),
      ],
    };
  }

  async function templateRows(key: string) {
    return await db`
      select version, name, definition, owner_user_id, source_program_id
      from public.program_templates where key = ${key} order by version`;
  }

  function strengthEnrollment(template: PublishedTemplate): EnrollmentPayload {
    return {
      templateKey: template.key,
      templateVersion: template.version,
      unit: 'kg',
      options: {},
      bindings: Object.fromEntries([squatId, benchId, rowId, pullUpId].map((id) => [customLiftKey(id), id])),
      inputs: { [customLiftKey(squatId)]: { workingWeight: 100 }, [customLiftKey(benchId)]: { workingWeight: 60 } },
      rounding: { ...KG_ROUNDING },
    };
  }

  it('compiles the program into a rotation the domain parses, with one rule per linear lift that holds on a miss', async () => {
    const user = await createTestUser();
    const program = strengthProgram();
    const programId = await savedProgram(user, program);

    const template = await publishedProgram(user, programId);

    const key = customTemplateKey(programId);
    expect(template).toEqual({ key, version: 1 });
    const [squat, bench, row, pullUp] = [squatId, benchId, rowId, pullUpId].map(customLiftKey);
    const working = { kind: 'pct', pct: 1, of: 'workingWeight' };
    const [stored] = await templateRows(key);
    expect(stored).toMatchObject({
      version: 1,
      name: 'Strength A/B',
      owner_user_id: user.id,
      source_program_id: programId,
    });
    expect(stored.definition).toEqual({
      key,
      version: 1,
      name: 'Strength A/B',
      source: [],
      lifts: [
        { key: squat, name: 'Back Squat', barbell: true },
        { key: bench, name: 'Barbell Bench Press', barbell: true },
        { key: row, name: 'Barbell Row', barbell: true },
        { key: pullUp, name: 'Pull-up', barbell: false },
      ],
      inputs: [{ lifts: [squat, bench], kinds: ['workingWeight'] }],
      referenceVars: ['workingWeight'],
      initial: [{ kind: 'copy', var: 'workingWeight', from: 'workingWeight' }],
      options: [],
      schedule: {
        kind: 'rotation',
        days: [
          {
            key: 'd0',
            name: 'Day A',
            slots: [
              { id: 'd0_0', lift: squat, role: 'main', scheme: { kind: 'repeat', count: 5, reps: 5, load: working } },
              { id: 'd0_1', lift: bench, role: 'main', scheme: { kind: 'repeat', count: 3, reps: 5, load: working } },
              {
                id: 'd0_2',
                lift: row,
                role: 'main',
                scheme: { kind: 'repeat', count: 3, reps: 8, maxReps: 12, load: { kind: 'lastLogged' } },
              },
            ],
          },
          {
            key: 'd1',
            name: 'Day B',
            slots: [
              { id: 'd1_0', lift: squat, role: 'main', scheme: { kind: 'repeat', count: 5, reps: 5, load: working } },
              {
                id: 'd1_1',
                lift: pullUp,
                role: 'main',
                scheme: { kind: 'repeat', count: 3, reps: 5, maxReps: 10, load: { kind: 'lastLogged' } },
              },
            ],
          },
        ],
      },
      progression: [
        {
          lift: squat,
          var: 'workingWeight',
          trigger: 'afterSession',
          judgedSlots: ['d0_0', 'd1_0'],
          onMet: [{ kind: 'increment', by: { kg: 2.5, lb: 5 } }],
          onMiss: [{ kind: 'hold' }],
        },
      ],
    });
  });

  it('publishes a definition that parseProgramDefinition and validateEnrollment accept and the owner can follow', async () => {
    const user = await createTestUser();
    const programId = await savedProgram(user, strengthProgram());
    const template = await publishedProgram(user, programId);
    const { data, error } = await user.client
      .from('program_templates')
      .select('definition')
      .eq('key', template.key)
      .eq('version', template.version)
      .single();
    expect(error).toBeNull();

    const parsed = parseProgramDefinition(data?.definition);

    expect(parsed.kind, JSON.stringify(parsed)).toBe('ok');
    if (parsed.kind !== 'ok') return;
    const enrollment = strengthEnrollment(template);
    const domainEnrollment: ProgramEnrollment = {
      id: randomUUID(),
      unit: 'kg',
      options: {},
      bindings: enrollment.bindings as Record<string, string>,
      inputs: enrollment.inputs as Record<string, Record<string, number>>,
      rounding: { increment: 2.5, mode: 'nearest', barWeight: 20 },
    };
    expect(validateEnrollment(parsed.definition, domainEnrollment)).toEqual([]);
    await enrolled(user, enrollment);
  });

  it('compiles a custom exercise switched to bodyweight after the save as last logged, with no starting weight', async () => {
    const user = await createTestUser();
    const customId = await createCustomExercise(user);
    const programId = await savedProgram(user, {
      id: randomUUID(),
      name: 'Switched',
      days: [plannedDay('Day 1', [linearFiveByFive(customId)])],
    });
    await db`update public.exercises set load_type = 'bodyweight' where id = ${customId}`;

    const template = await publishedProgram(user, programId);

    const [stored] = await templateRows(template.key);
    expect(stored.definition.inputs).toEqual([]);
    expect(stored.definition.progression).toEqual([]);
    expect(stored.definition.schedule.days[0].slots[0].scheme.load).toEqual({ kind: 'lastLogged' });
    expect(parseProgramDefinition(stored.definition).kind).toBe('ok');
  });

  it('reuses the latest version when the program has not changed', async () => {
    const user = await createTestUser();
    const programId = await savedProgram(user, strengthProgram());
    const first = await publishedProgram(user, programId);

    const second = await publishedProgram(user, programId);

    expect(second).toEqual(first);
    expect(await templateRows(first.key)).toHaveLength(1);
  });

  it('adds the next version after an edit and keeps the earlier one', async () => {
    const user = await createTestUser();
    const program = strengthProgram();
    const programId = await savedProgram(user, program);
    await publishedProgram(user, programId);
    program.days[0].exercises[0] = linearFiveByFive(squatId, 5, 10);
    await savedProgram(user, program);

    const edited = await publishedProgram(user, programId);

    expect(edited).toEqual({ key: customTemplateKey(programId), version: 2 });
    const rows = await templateRows(edited.key);
    expect(rows.map((row) => [row.version, row.definition.version])).toEqual([
      [1, 1],
      [2, 2],
    ]);
    expect(rows[1].definition.progression[0].onMet).toEqual([{ kind: 'increment', by: { kg: 5, lb: 10 } }]);
    expect(await publishedProgram(user, programId)).toEqual(edited);
  });

  it("refuses another user's program, a built-in program and a program that does not exist", async () => {
    const owner = await createTestUser();
    const stranger = await createTestUser();
    const programId = await savedProgram(owner, strengthProgram());
    const [builtIn] = await db`select id from public.programs where owner_user_id is null limit 1`;

    for (const id of [programId, builtIn.id as string, randomUUID()]) {
      expectRefused(await publishProgram(stranger, id), 'program_not_found');
    }
    expect(await templateRows(customTemplateKey(programId))).toHaveLength(0);
  });

  it('hides a snapshot from every other user, and following it raises unknown_template', async () => {
    const owner = await createTestUser();
    const stranger = await createTestUser();
    const template = await publishedProgram(owner, await savedProgram(owner, strengthProgram()));

    const { data } = await stranger.client.from('program_templates').select('key').eq('key', template.key);

    expect(data).toEqual([]);
    expectRefused(await enroll(stranger, strengthEnrollment(template)), 'unknown_template');
  });

  it('counts only new snapshots against the hourly limit and refuses the 21st', async () => {
    const user = await createTestUser();
    const programId = await savedProgram(user, strengthProgram());
    await publishedProgram(user, programId);
    await publishedProgram(user, programId);
    expect(await rateLimitHits('program_publish_hour', user.id)).toBe(1);

    await seedRateLimitHits('program_publish_hour', user.id, 20);
    const otherProgramId = await savedProgram(user, strengthProgram());

    expectRateLimited(await publishProgram(user, otherProgramId));
    expect(await templateRows(customTemplateKey(otherProgramId))).toHaveLength(0);
    expect(await publishedProgram(user, programId)).toEqual({ key: customTemplateKey(programId), version: 1 });
  });

  it('publishes a snapshot the web reads as the current version of the program it was saved from', async () => {
    const user = await createTestUser();
    const linearBy = (incrementKg: number, incrementLb: number) => ({
      kind: 'linear' as const,
      incrementKg,
      incrementLb,
    });
    const planned = (exerciseId: string, sets: number, reps: number, progression: PlannedProgression) => ({
      exerciseId,
      targetSets: sets,
      targetRepsMin: reps,
      targetRepsMax: reps,
      progression,
    });
    const doc: WebProgramDoc = {
      id: randomUUID(),
      name: 'Bench first',
      days: [
        {
          id: randomUUID(),
          name: 'Day A',
          exercises: [
            planned(benchId, 3, 8, { kind: 'none' }),
            planned(squatId, 5, 5, linearBy(2.5, 5)),
            { ...planned(rowId, 3, 8, { kind: 'fixed' }), targetRepsMax: 12 },
          ],
        },
        {
          id: randomUUID(),
          name: 'Day B',
          exercises: [planned(benchId, 5, 5, linearBy(1.25, 2.5)), planned(squatId, 5, 5, linearBy(5, 10))],
        },
      ],
    };
    const programId = await savedProgram(user, programPayload(doc));
    const template = await publishedProgram(user, programId);
    const enrollmentId = await enrolled(user, {
      ...strengthEnrollment(template),
      bindings: Object.fromEntries([squatId, benchId, rowId].map((id) => [customLiftKey(id), id])),
      inputs: Object.fromEntries([squatId, benchId, rowId].map((id) => [customLiftKey(id), { workingWeight: 60 }])),
    });

    const { data: programRow } = await user.client.from('programs').select(PROGRAM_SELECT).eq('id', programId).single();
    const { data: templateRows } = await user.client
      .from('program_templates')
      .select('key, version, name, definition, owner_user_id')
      .eq('key', template.key);
    const { data: enrollment } = await user.client
      .from('program_enrollments')
      .select(
        'id, template_key, template_version, unit, options, lift_bindings, inputs, rounding, started_at, ended_at',
      )
      .eq('id', enrollmentId)
      .single();

    const program = toProgram(programRow as ProgramRow);
    expect(followStatus(program, enrollment as EnrollmentRow, templateRows as ProgramTemplateRow[])).toBe('current');
  });
});

describe('delete_program on a program you follow', () => {
  async function followedSquatProgram(user: TestUser) {
    const squatId = exerciseIds.back_squat;
    const programId = await savedProgram(user, {
      id: randomUUID(),
      name: 'Followed 5x5',
      days: [plannedDay('Day 1', [linearFiveByFive(squatId)])],
    });
    const template = await publishedProgram(user, programId);
    const liftKey = customLiftKey(squatId);
    const enrollmentId = await enrolled(user, {
      templateKey: template.key,
      templateVersion: template.version,
      unit: 'kg',
      options: {},
      bindings: { [liftKey]: squatId },
      inputs: { [liftKey]: { workingWeight: 100 } },
      rounding: { ...KG_ROUNDING },
    });
    return { programId, template, enrollmentId };
  }

  async function linkedSession(user: TestUser, enrollmentId: string): Promise<string> {
    const sessionId = randomUUID();
    await db`
      insert into public.sessions
        (id, user_id, started_at, ended_at, local_date, timezone, balance_version, derived_balance_version, summary,
         enrollment_id, program_position)
      values (${sessionId}, ${user.id}, now(), now(), current_date, 'UTC', 1, 1, '{}', ${enrollmentId},
              ${db.json({ index: 0 })})`;
    return sessionId;
  }

  async function deleteProgram(user: TestUser, programId: string) {
    return await user.client.rpc('delete_program', { program_id: programId });
  }

  it('ends the enrollment, keeps the snapshot and leaves past sessions linked to the enrollment', async () => {
    const user = await createTestUser();
    const { programId, template, enrollmentId } = await followedSquatProgram(user);
    const sessionId = await linkedSession(user, enrollmentId);

    expect((await deleteProgram(user, programId)).error).toBeNull();

    const [enrollment] = await enrollmentRows(user.id);
    expect(enrollment.id).toBe(enrollmentId);
    expect(enrollment.ended_at).not.toBeNull();
    const [session] = await db`select enrollment_id from public.sessions where id = ${sessionId}`;
    expect(session.enrollment_id).toBe(enrollmentId);
    const snapshots = await db`
      select version, owner_user_id, source_program_id from public.program_templates where key = ${template.key}`;
    expect(snapshots).toEqual([{ version: template.version, owner_user_id: user.id, source_program_id: null }]);
  });

  it('ends the enrollment in an earlier snapshot of the program too', async () => {
    const user = await createTestUser();
    const { programId, enrollmentId } = await followedSquatProgram(user);
    await savedProgram(user, {
      id: programId,
      name: 'Followed 5x5',
      days: [plannedDay('Day 1', [linearFiveByFive(exerciseIds.back_squat, 5, 10)])],
    });
    expect(await publishedProgram(user, programId)).toMatchObject({ version: 2 });

    expect((await deleteProgram(user, programId)).error).toBeNull();

    expect((await enrollmentRows(user.id)).map((row) => [row.id, row.ended_at === null])).toEqual([
      [enrollmentId, false],
    ]);
  });

  it('leaves an enrollment in another program running', async () => {
    const user = await createTestUser();
    const { programId: earlierProgramId } = await followedSquatProgram(user);
    const followed = await followedSquatProgram(user);
    const madcowFollower = await createTestUser();
    const { programId: unfollowedProgramId } = await followedSquatProgram(madcowFollower);
    await enrolled(madcowFollower, madcowPayload());

    expect((await deleteProgram(user, earlierProgramId)).error).toBeNull();
    expect((await deleteProgram(madcowFollower, unfollowedProgramId)).error).toBeNull();

    const activeKeys = async (userId: string) =>
      (await enrollmentRows(userId)).filter((row) => row.ended_at === null).map((row) => row.template_key);
    expect(await activeKeys(user.id)).toEqual([followed.template.key]);
    expect(await activeKeys(madcowFollower.id)).toEqual(['madcow_5x5']);
  });

  it("does not end another user's enrollment when they cannot delete the program", async () => {
    const owner = await createTestUser();
    const stranger = await createTestUser();
    const { programId, enrollmentId } = await followedSquatProgram(owner);

    expectRefused(await deleteProgram(stranger, programId), 'program_not_found');

    expect((await enrollmentRows(owner.id)).map((row) => [row.id, row.ended_at])).toEqual([[enrollmentId, null]]);
  });
});
