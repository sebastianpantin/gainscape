import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ProgramDefinition } from '@domain/index.ts';
import { FIVE_THREE_ONE } from '../domain/program-fixtures/five_three_one.ts';
import { GZCLP_SHAPE } from '../domain/program-fixtures/gzclp.ts';
import { MADCOW_5X5 } from '../domain/program-fixtures/madcow_5x5.ts';
import {
  anon,
  builtInExerciseId,
  createTestUser,
  db,
  postFunction,
  rateLimitHits,
  seedRateLimitHits,
  TEST_PASSWORD,
  type TestUser,
} from './local-stack.ts';
import { createCustomExercise } from './session-support.ts';

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
const ROTATION_TEMPLATE: ProgramDefinition = { ...structuredClone(GZCLP_SHAPE), key: ROTATION_TEMPLATE_KEY };

const KG_ROUNDING = { increment: 2.5, mode: 'nearest', barWeight: 20 };

let exerciseIds: Record<string, string>;

beforeAll(async () => {
  const keys = ['back_squat', 'barbell_bench_press', 'barbell_row', 'overhead_press', 'deadlift'];
  exerciseIds = Object.fromEntries(await Promise.all(keys.map(async (key) => [key, await builtInExerciseId(key)])));
  await db`
    insert into public.program_templates (key, version, name, definition)
    values (${ROTATION_TEMPLATE_KEY}, 1, 'Rotation test template', ${db.json(JSON.parse(JSON.stringify(ROTATION_TEMPLATE)))})`;
});

afterAll(async () => {
  await db`delete from public.program_enrollments where template_key = ${ROTATION_TEMPLATE_KEY}`;
  await db`delete from public.program_templates where key = ${ROTATION_TEMPLATE_KEY}`;
  await db.end();
});

function madcowPayload(): EnrollmentPayload {
  return {
    templateKey: 'madcow_5x5',
    templateVersion: 1,
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
    templateVersion: 1,
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

async function databaseNow(): Promise<number> {
  const [row] = await db`select clock_timestamp() as now`;
  return (row.now as Date).getTime();
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
      .eq('version', 1)
      .single();
    expect(error).toBeNull();
    expect(data).toEqual({ key, version: 1, name, definition: JSON.parse(JSON.stringify(fixture)) });
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
      template_version: 1,
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
    ['an unknown template version', (p) => (p.templateVersion = 2), 'unknown_template'],
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
      ['cycle', 'jump_to', { cycle: 100, week: 4, day: 'press' }],
      ['rotation', 'skip_day', { index: 0 }],
      ['rotation', 'jump_to', { index: 10000 }],
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
      ['cycle', 'cycle 101', { cycle: 101, week: 1, day: 'squat' }],
      ['cycle', 'cycle 0', { cycle: 0, week: 1, day: 'squat' }],
      ['cycle', 'a week past the end of the cycle', { cycle: 1, week: 5, day: 'squat' }],
      ['cycle', 'week 0', { cycle: 1, week: 0, day: 'squat' }],
      ['cycle', 'a day the template does not have', { cycle: 1, week: 1, day: 'mon' }],
      ['cycle', 'no cycle', { week: 1, day: 'squat' }],
      ['rotation', 'index 10001', { index: 10001 }],
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
    payload.templateVersion = 2;
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
});
