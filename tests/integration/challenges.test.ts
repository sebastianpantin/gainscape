import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { DraftSet, LiftDraftExercise, WorkoutDraft } from '../../web/src/offline/draft-format.ts';
import { completeSessionPayload } from '../../web/src/offline/session-payload.ts';
import {
  builtInExerciseId,
  db,
  grantDrop,
  normalizedSnapshot,
  postCompleteSession,
  postFunction,
  rebuildCaches,
  setBodyweight,
  type TestUser,
} from './local-stack.ts';
import { DEFAULT_LOOT } from '@domain/index.ts';
import {
  aSet,
  DAY_MS,
  type Effort,
  expectLedgerMatchesItems,
  hard,
  hoursAgo,
  payloadAt,
  postSession,
  type SessionPayload,
  type SetShape,
  startsOnOneLocalDay,
  trackedUsers,
  withFreshIds,
} from './session-support.ts';

const SCROLL_KEY = 'scroll_deficit_deadlift';
const CHALLENGE_KEY = 'deadlift_and_pull_up';
const CHALLENGE_NAME = 'Deadlift and Pull-up';
const BODYWEIGHT_KG = 80;
const atFailure: Effort = { type: 'rir', value: 0 };

let deadliftId: string;
let pullUpId: string;
let benchId: string;
let challengeId: string;

const { freshUser, checkAndClear } = trackedUsers(expectLedgerMatchesItems);

beforeAll(async () => {
  [deadliftId, pullUpId, benchId] = await Promise.all([
    builtInExerciseId('deadlift'),
    builtInExerciseId('pull_up'),
    builtInExerciseId('barbell_bench_press'),
  ]);
  const [challenge] = await db`select id from public.challenges where key = ${CHALLENGE_KEY}`;
  challengeId = challenge.id;
});

afterEach(async () => {
  await checkAndClear();
});

afterAll(async () => {
  await db.end();
});

async function usePrRollsOfTheDay(userId: string, sessionId: string): Promise<void> {
  await db`
    insert into public.loot_rolls
      (user_id, session_id, set_id, kind, local_date, roll_index, drop_table_id, chance, hit, loot_version)
    select ${userId}, s.id, gen_random_uuid(), 'pr', s.local_date, roll_index, t.id, 0.5, false, ${DEFAULT_LOOT.version}
    from public.sessions s
    cross join public.drop_tables t
    cross join generate_series(0, 1) as roll_index
    where s.id = ${sessionId} and t.key = 'rare'`;
}

async function lifter(scrolls: number, quietAt: Date): Promise<TestUser> {
  const user = await freshUser();
  await setBodyweight(user, BODYWEIGHT_KG);
  const quiet = payloadAt(quietAt, [aSet(benchId, 0, 40, { isWarmup: true })]);
  await postSession(user, quiet);
  await usePrRollsOfTheDay(user.id, quiet.id);
  if (scrolls > 0) await grantDrop(user.id, quiet.id, randomUUID(), SCROLL_KEY, scrolls);
  return user;
}

async function scrollsHeld(userId: string): Promise<number> {
  const [row] = await db`
    select u.quantity from public.user_items u join public.items i on i.id = u.item_id
    where u.user_id = ${userId} and i.key = ${SCROLL_KEY}`;
  return row?.quantity ?? 0;
}

async function challengeLedger(userId: string) {
  return await db`
    select delta, reason::text, ref_id from public.item_ledger
    where user_id = ${userId} and reason = 'challenge' order by created_at, id`;
}

async function storedSession(sessionId: string) {
  const [row] = await db`select challenge, summary, history_only from public.sessions where id = ${sessionId}`;
  return row;
}

function challengeSets(deadliftKg: number, deadliftSets = 5): SetShape[] {
  const deadlifts = Array.from({ length: deadliftSets }, () => aSet(deadliftId, 0, deadliftKg));
  const pullUps = Array.from({ length: 5 }, () => aSet(pullUpId, 0, 0));
  return [...deadlifts, ...pullUps].map((set, position) => ({ ...set, position }));
}

function withChallenge<T extends object>(payload: T): T & { challenge: { challengeId: string } } {
  return { ...payload, challenge: { challengeId } };
}

function challengePayload(startedAt: Date, deadliftKg = 100, deadliftSets = 5) {
  return withChallenge(payloadAt(startedAt, challengeSets(deadliftKg, deadliftSets)));
}

async function edit(user: TestUser, session: SessionPayload, sets: SetShape[], ifRevision: number): Promise<void> {
  const response = await postFunction('edit-session', user.accessToken, {
    sessionId: session.id,
    ifRevision,
    notes: session.notes,
    sets,
  });
  expect(response.status, response.rawBody).toBe(200);
}

async function skillXp(sessionId: string) {
  return await db`
    select st.position, sk.key, x.xp from public.set_skill_xp x
    join public.sets st on st.id = x.set_id
    join public.skills sk on sk.id = x.skill_id
    where st.session_id = ${sessionId} order by st.position, sk.key`;
}

async function sessionSkillXp(sessionId: string, skillKey: string): Promise<number> {
  return (await skillXp(sessionId)).filter((row) => row.key === skillKey).reduce((sum, row) => sum + Number(row.xp), 0);
}

async function userSkills(userId: string) {
  return await db`
    select sk.key, us.xp from public.user_skills us join public.skills sk on sk.id = us.skill_id
    where us.user_id = ${userId} order by sk.key`;
}

async function repMaxes(userId: string) {
  return await db`
    select exercise_id, reps, load_kg::float from public.rep_maxes where user_id = ${userId}
    order by exercise_id, reps`;
}

async function rolledSets(sessionId: string) {
  return await db`
    select st.position, r.kind::text from public.loot_rolls r
    join public.sets st on st.id = r.set_id
    where r.session_id = ${sessionId} order by st.position, r.kind`;
}

function judgeFloorKg(pct: number, e1rmKg: number): number {
  return Math.floor((pct * e1rmKg) / 100 / 2.5) * 2.5;
}

describe('claiming a scroll at sync', () => {
  it('uses one scroll per challenge session, whether it passes or fails', async () => {
    const [quietAt, passAt, failAt] = startsOnOneLocalDay(3);
    const user = await lifter(2, quietAt);
    const twin = await lifter(0, quietAt);
    const passing = challengePayload(passAt);
    const plainTwin = withFreshIds(payloadAt(passAt, passing.sets));

    const passed = await postSession(user, passing);
    await postSession(twin, plainTwin);

    expect(await scrollsHeld(user.id)).toBe(1);
    expect(passed.body.challenge).toEqual({
      challengeId,
      key: CHALLENGE_KEY,
      name: CHALLENGE_NAME,
      passed: true,
      targetLoadsKg: { [deadliftId]: null },
    });
    const backBase = await sessionSkillXp(plainTwin.id, 'back');
    expect(passed.body.challengeBonusBySkill?.back).toBe(Math.round(backBase / 4));
    expect(await sessionSkillXp(passing.id, 'back')).toBe(backBase + Math.round(backBase / 4));
    expect((await storedSession(passing.id)).challenge).toEqual({
      challengeId,
      key: CHALLENGE_KEY,
      name: CHALLENGE_NAME,
      definition: {
        kind: 'prescription',
        groups: [
          {
            rounds: 5,
            exercises: [
              { exerciseId: deadliftId, reps: 5, pct: 70 },
              { exerciseId: pullUpId, reps: 5, pct: null },
            ],
          },
        ],
      },
      e1rmKg: { [deadliftId]: null },
    });

    const failing = challengePayload(failAt, 100, 4);
    const failed = await postSession(user, failing);

    expect(await scrollsHeld(user.id)).toBe(0);
    expect(failed.body.challenge).toMatchObject({ challengeId, passed: false });
    expect(failed.body.challengeBonusBySkill).toEqual({});
    expect(await challengeLedger(user.id)).toEqual([
      { delta: -1, reason: 'challenge', ref_id: passing.id },
      { delta: -1, reason: 'challenge', ref_id: failing.id },
    ]);
  });

  it('completes a normal session when no scroll is held', async () => {
    const [quietAt, sessionAt] = startsOnOneLocalDay(2);
    const user = await lifter(0, quietAt);
    const session = challengePayload(sessionAt);

    const response = await postSession(user, session);

    expect(response.body.challenge).toBeNull();
    expect(response.body.challengeBonusBySkill).toEqual({});
    expect((await storedSession(session.id)).challenge).toBeNull();
    expect(await challengeLedger(user.id)).toEqual([]);
  });

  it('completes a normal session when another device already used the last scroll', async () => {
    const [quietAt, firstAt, secondAt] = startsOnOneLocalDay(3);
    const user = await lifter(1, quietAt);
    const first = challengePayload(firstAt);
    const second = challengePayload(secondAt);

    await postSession(user, first);
    const response = await postSession(user, second);

    expect(response.body.challenge).toBeNull();
    expect(response.body.challengeBonusBySkill).toEqual({});
    expect((await storedSession(second.id)).challenge).toBeNull();
    expect(await scrollsHeld(user.id)).toBe(0);
    expect(await challengeLedger(user.id)).toHaveLength(1);
  });

  it('does not claim twice when the same session is resubmitted', async () => {
    const [quietAt, sessionAt] = startsOnOneLocalDay(2);
    const user = await lifter(2, quietAt);
    const session = challengePayload(sessionAt);

    await postSession(user, session);
    await postSession(user, session);

    expect(await scrollsHeld(user.id)).toBe(1);
    expect(await challengeLedger(user.id)).toHaveLength(1);
  });

  it('lets only one of two concurrent challenge sessions use a single scroll', async () => {
    const [quietAt, firstAt, secondAt] = startsOnOneLocalDay(3);
    const user = await lifter(1, quietAt);
    const sessions = [challengePayload(firstAt), challengePayload(secondAt)];

    const responses = await Promise.all(sessions.map((session) => postCompleteSession(user.accessToken, session)));

    for (const response of responses) expect(response.status, response.rawBody).toBe(200);
    expect(responses.filter((response) => response.body.challenge !== null)).toHaveLength(1);
    const stored = await Promise.all(sessions.map((session) => storedSession(session.id)));
    expect(stored.filter((row) => row.challenge !== null)).toHaveLength(1);
    expect(await scrollsHeld(user.id)).toBe(0);
    expect(await challengeLedger(user.id)).toHaveLength(1);
  });

  it('completes a normal session when the scroll item is retired', async () => {
    const [quietAt, sessionAt] = startsOnOneLocalDay(2);
    const user = await lifter(1, quietAt);
    const session = challengePayload(sessionAt);

    await db`update public.items set retired_at = now() where key = ${SCROLL_KEY}`;
    try {
      const response = await postSession(user, session);
      expect(response.body.challenge).toBeNull();
    } finally {
      await db`update public.items set retired_at = null where key = ${SCROLL_KEY}`;
    }

    expect((await storedSession(session.id)).challenge).toBeNull();
    expect(await scrollsHeld(user.id)).toBe(1);
    expect(await challengeLedger(user.id)).toEqual([]);
  });

  it('does not refund the scroll when the challenge session is deleted', async () => {
    const [quietAt, sessionAt] = startsOnOneLocalDay(2);
    const user = await lifter(1, quietAt);
    const session = challengePayload(sessionAt);
    await postSession(user, session);

    const deleted = await postFunction('delete-session', user.accessToken, { sessionId: session.id });

    expect(deleted.status, deleted.rawBody).toBe(200);
    expect(await scrollsHeld(user.id)).toBe(0);
    expect(await challengeLedger(user.id)).toEqual([{ delta: -1, reason: 'challenge', ref_id: session.id }]);
    const refunds = await db`
      select l.delta from public.item_ledger l join public.items i on i.id = l.item_id
      where l.user_id = ${user.id} and i.key = ${SCROLL_KEY} and l.delta > 0 and l.ref_id = ${session.id}`;
    expect(refunds).toEqual([]);
  });

  it('never claims a scroll for a history-only session', async () => {
    const user = await lifter(1, hoursAgo(4));
    const session = withChallenge(payloadAt(new Date(Date.now() - 8 * DAY_MS), challengeSets(100)));

    const response = await postSession(user, session);

    expect(response.body.historyOnly).toBe(true);
    expect((await storedSession(session.id)).challenge).toBeNull();
    expect(await scrollsHeld(user.id)).toBe(1);
    expect(await challengeLedger(user.id)).toEqual([]);
  });
});

describe('a challenge done as a superset', () => {
  function draftSet(weightKg: number): DraftSet {
    return { id: randomUUID(), weightKg, reps: 5, effort: hard, done: true, isWarmup: false, prescription: null };
  }

  function exercise(exerciseId: string, weightKg: number, supersetId: string | null): LiftDraftExercise {
    return {
      exerciseId,
      name: exerciseId,
      modality: 'lift',
      loadType: exerciseId === pullUpId ? 'bodyweight' : 'external',
      target: null,
      supersetId,
      sets: Array.from({ length: 5 }, () => draftSet(weightKg)),
    };
  }

  function draft(startedAt: Date, supersetId: string | null): WorkoutDraft {
    return {
      sessionId: randomUUID(),
      startedAt: startedAt.toISOString(),
      finishedAt: new Date(startedAt.getTime() + 30 * 60 * 1000).toISOString(),
      programDayId: null,
      programLabel: null,
      program: null,
      exercises: [exercise(deadliftId, 100, supersetId), exercise(pullUpId, 0, supersetId)],
    };
  }

  it('gives the same XP, records and loot rolls as the same sets logged ungrouped', async () => {
    const [quietAt, startedAt] = startsOnOneLocalDay(2);
    const [grouped, ungrouped] = [await lifter(1, quietAt), await lifter(1, quietAt)];
    const groupedPayload = withChallenge(completeSessionPayload(draft(startedAt, randomUUID())));
    const ungroupedPayload = withChallenge(completeSessionPayload(draft(startedAt, null)));

    const groupedResponse = await postSession(grouped, groupedPayload);
    const ungroupedResponse = await postSession(ungrouped, ungroupedPayload);

    expect(groupedResponse.body.challenge?.passed).toBe(true);
    expect(groupedResponse.body.xpBySkill).toEqual(ungroupedResponse.body.xpBySkill);
    expect(groupedResponse.body.challengeBonusBySkill).toEqual(ungroupedResponse.body.challengeBonusBySkill);
    expect(await skillXp(groupedPayload.id)).toEqual(await skillXp(ungroupedPayload.id));
    expect(await repMaxes(grouped.id)).toEqual(await repMaxes(ungrouped.id));
    expect(await rolledSets(groupedPayload.id)).toEqual(await rolledSets(ungroupedPayload.id));
  });
});

describe('replaying a challenge verdict', () => {
  it('flips the verdict on an edit, keeps the scroll used and survives rebuild-caches', async () => {
    const [quietAt, openerAt, sessionAt] = startsOnOneLocalDay(3);
    const user = await lifter(1, quietAt);
    const twin = await lifter(0, quietAt);
    const opener = payloadAt(openerAt, [aSet(deadliftId, 0, 100)]);
    await postSession(user, opener);
    await postSession(twin, withFreshIds(opener));
    const session = challengePayload(sessionAt);
    const twinSession = withFreshIds(payloadAt(sessionAt, session.sets));
    await postSession(user, session);
    await postSession(twin, twinSession);
    const passed = await storedSession(session.id);
    expect(passed.summary.challenge.passed).toBe(true);
    expect(Object.keys(passed.summary.challengeBonusBySkill)).not.toHaveLength(0);
    expect(await scrollsHeld(user.id)).toBe(0);

    const withoutOneDeadlift = (sets: SetShape[]) => sets.filter((set) => set.position !== 4);
    await edit(user, session, withoutOneDeadlift(session.sets), 0);
    await edit(twin, twinSession, withoutOneDeadlift(twinSession.sets), 0);

    const failed = await storedSession(session.id);
    expect(failed.summary.challenge.passed).toBe(false);
    expect(failed.summary.challengeBonusBySkill).toEqual({});
    expect(await userSkills(user.id)).toEqual(await userSkills(twin.id));
    expect(await scrollsHeld(user.id)).toBe(0);
    expect(await challengeLedger(user.id)).toHaveLength(1);

    await edit(user, session, session.sets, 1);
    await edit(
      twin,
      twinSession,
      twinSession.sets.map((set) => ({ ...set, id: randomUUID() })),
      1,
    );

    const restored = await storedSession(session.id);
    expect(restored.summary.challenge.passed).toBe(true);
    expect(restored.summary.challengeBonusBySkill).toEqual(passed.summary.challengeBonusBySkill);
    expect(restored.challenge).toEqual(passed.challenge);

    const before = await normalizedSnapshot(user.id);
    expect((await rebuildCaches(user.id)).status).toBe(200);
    expect(await normalizedSnapshot(user.id)).toEqual(before);
    expect((await storedSession(session.id)).summary).toEqual(restored.summary);
  });

  it('keeps a verdict when an earlier session raises the e1RM', async () => {
    const [quietAt, openerAt, sessionAt] = startsOnOneLocalDay(3);
    const user = await lifter(1, quietAt);
    const opener = payloadAt(openerAt, [aSet(deadliftId, 0, 100)]);
    await postSession(user, opener);
    const session = challengePayload(sessionAt);
    await postSession(user, session);
    const passed = await storedSession(session.id);
    expect(passed.summary.challenge.passed).toBe(true);
    const snapshotE1rm = passed.challenge.e1rmKg[deadliftId];
    expect(snapshotE1rm).toBeGreaterThan(100);

    await edit(user, opener, [{ ...opener.sets[0], weightKg: 200 }], 0);

    const [{ e1rm_candidate_kg: raisedE1rm }] = await db`
      select e1rm_candidate_kg::float from public.sets where id = ${opener.sets[0].id}`;
    expect(judgeFloorKg(70, raisedE1rm)).toBeGreaterThan(100);
    const after = await storedSession(session.id);
    expect(after.challenge).toEqual(passed.challenge);
    expect(after.summary.challenge).toEqual(passed.summary.challenge);
    expect(Object.keys(after.summary.challengeBonusBySkill)).not.toHaveLength(0);
  });

  it('fails a challenge whose target rose after the prefill, and stores the server floor', async () => {
    const [quietAt, baseAt, heavyAt, challengeAt] = startsOnOneLocalDay(4);
    const user = await lifter(1, quietAt);
    await postSession(user, payloadAt(baseAt, [aSet(deadliftId, 0, 140, { reps: 1, effort: atFailure })]));
    const prefilled = challengePayload(challengeAt, 100);
    await postSession(user, payloadAt(heavyAt, [aSet(deadliftId, 0, 160, { reps: 3, effort: atFailure })]));

    const response = await postSession(user, prefilled);

    const snapshotE1rm = (await storedSession(prefilled.id)).challenge.e1rmKg[deadliftId];
    const floor = judgeFloorKg(70, snapshotE1rm);
    expect(floor).toBeGreaterThan(101.5);
    expect(response.body.challenge).toMatchObject({ passed: false, targetLoadsKg: { [deadliftId]: floor } });
    expect(response.body.challengeBonusBySkill).toEqual({});
    expect(await scrollsHeld(user.id)).toBe(0);
  });
});
