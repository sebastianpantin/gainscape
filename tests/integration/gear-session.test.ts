import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  builtInExerciseId,
  createTestUser,
  db,
  grantDrop,
  normalizedSnapshot,
  postFunction,
  rebuildCaches,
  type TestUser,
} from './local-stack.ts';
import {
  aSet,
  hoursAgo,
  payloadAt,
  postSession,
  type SessionPayload,
  type SetShape,
  withFreshIds,
} from './session-support.ts';

let squatId: string;
let benchId: string;

beforeAll(async () => {
  [squatId, benchId] = await Promise.all([builtInExerciseId('back_squat'), builtInExerciseId('barbell_bench_press')]);
});

afterAll(async () => {
  await db.end();
});

interface Twins {
  geared: TestUser;
  gearless: TestUser;
  gearedSessionForLoot: string;
}

async function twins(): Promise<Twins> {
  const [geared, gearless] = await Promise.all([createTestUser(), createTestUser()]);
  const warmup = payloadAt(hoursAgo(8), [aSet(benchId, 0, 40, { isWarmup: true })]);
  await postSession(geared, warmup);
  await postSession(gearless, withFreshIds(warmup));
  return { geared, gearless, gearedSessionForLoot: warmup.id };
}

async function equip(user: TestUser, sessionId: string, slot: string, itemKey: string): Promise<void> {
  const { itemId } = await grantDrop(user.id, sessionId, randomUUID(), itemKey, 1);
  const equipped = await user.client.rpc('equip_gear', { slot, item_id: itemId });
  expect(equipped.error).toBeNull();
}

async function unequip(user: TestUser, slot: string): Promise<void> {
  const unequipped = await user.client.rpc('unequip_gear', { slot });
  expect(unequipped.error).toBeNull();
}

function squatSession(): SessionPayload {
  return payloadAt(hoursAgo(4), [aSet(squatId, 0, 100), aSet(squatId, 1, 100), aSet(squatId, 2, 100)]);
}

async function edit(user: TestUser, session: SessionPayload, sets: SetShape[]): Promise<void> {
  const response = await postFunction('edit-session', user.accessToken, {
    sessionId: session.id,
    ifRevision: 0,
    notes: session.notes,
    sets,
  });
  expect(response.status, response.rawBody).toBe(200);
}

async function skillXpByPosition(sessionId: string, skillKey: string): Promise<number[]> {
  const rows = await db`
    select st.position, coalesce(sum(x.xp), 0)::int as xp
    from public.sets st
    left join public.set_skill_xp x on x.set_id = st.id
      and x.skill_id = (select id from public.skills where key = ${skillKey})
    where st.session_id = ${sessionId}
    group by st.position order by st.position`;
  return rows.map((row) => row.xp);
}

async function sessionSkillXp(sessionId: string, skillKey: string): Promise<number> {
  return (await skillXpByPosition(sessionId, skillKey)).reduce((sum, xp) => sum + xp, 0);
}

async function userSkillXp(userId: string, skillKey: string): Promise<number> {
  const [row] = await db`
    select coalesce(sum(us.xp), 0)::int as xp from public.user_skills us
    join public.skills sk on sk.id = us.skill_id
    where us.user_id = ${userId} and sk.key = ${skillKey}`;
  return row.xp;
}

async function storedSession(sessionId: string) {
  const [row] = await db`select gear_loadout, summary from public.sessions where id = ${sessionId}`;
  return row;
}

async function allSkillXpByPosition(sessionId: string) {
  return await db`
    select st.position, sk.key, x.xp from public.set_skill_xp x
    join public.sets st on st.id = x.set_id
    join public.skills sk on sk.id = x.skill_id
    where st.session_id = ${sessionId} order by st.position, sk.key`;
}

describe('complete-session with a gear loadout', () => {
  it('snapshots the equipped loadout and adds the bonus on top of the gearless XP', async () => {
    const { geared, gearless, gearedSessionForLoot } = await twins();
    await equip(geared, gearedSessionForLoot, 'belt', 'ascendant_belt');
    const session = squatSession();
    const twin = withFreshIds(session);
    await postSession(geared, session);
    await postSession(gearless, twin);

    const stored = await storedSession(session.id);
    expect(stored.gear_loadout).toEqual({ belt: 'ascendant' });
    const coreBase = await sessionSkillXp(twin.id, 'core');
    const legsBase = await sessionSkillXp(twin.id, 'legs');
    expect(stored.summary.gearBonusBySkill).toEqual({
      core: Math.round(coreBase / 10),
      legs: Math.round(legsBase / 30),
    });
    expect(await sessionSkillXp(session.id, 'core')).toBe(coreBase + Math.round(coreBase / 10));
    expect(await userSkillXp(geared.id, 'core')).toBe(
      (await userSkillXp(gearless.id, 'core')) + Math.round(coreBase / 10),
    );
  });

  it('stores an empty loadout and the gearless XP when nothing is equipped', async () => {
    const { geared: plain, gearless } = await twins();
    const session = squatSession();
    const twin = withFreshIds(session);
    await postSession(plain, session);
    await postSession(gearless, twin);

    const stored = await storedSession(session.id);
    expect(stored.gear_loadout).toEqual({});
    expect(stored.summary.gearBonusBySkill).toEqual({});
    expect(await allSkillXpByPosition(session.id)).toEqual(await allSkillXpByPosition(twin.id));
    expect(await userSkillXp(plain.id, 'core')).toBe(await userSkillXp(gearless.id, 'core'));
  });
});

describe('replay with the stored gear snapshot', () => {
  it('keeps the bonus of the stored snapshot when an edit replays after unequipping', async () => {
    const { geared, gearless, gearedSessionForLoot } = await twins();
    await equip(geared, gearedSessionForLoot, 'belt', 'ascendant_belt');
    const session = squatSession();
    const twin = withFreshIds(session);
    await postSession(geared, session);
    await postSession(gearless, twin);
    await unequip(geared, 'belt');

    await edit(
      geared,
      session,
      session.sets.map((set) => ({ ...set, reps: 8 })),
    );
    await edit(
      gearless,
      twin,
      twin.sets.map((set) => ({ ...set, reps: 8 })),
    );

    const coreBase = await sessionSkillXp(twin.id, 'core');
    const stored = await storedSession(session.id);
    expect(stored.gear_loadout).toEqual({ belt: 'ascendant' });
    expect(stored.summary.gearBonusBySkill.core).toBe(Math.round(coreBase / 10));
    expect(await userSkillXp(geared.id, 'core')).toBe(
      (await userSkillXp(gearless.id, 'core')) + Math.round(coreBase / 10),
    );
  });

  it('rewrites the bonus share of every set when only one set is edited', async () => {
    const { geared, gearless, gearedSessionForLoot } = await twins();
    await equip(geared, gearedSessionForLoot, 'belt', 'ascendant_belt');
    const session = squatSession();
    const twin = withFreshIds(session);
    await postSession(geared, session);
    await postSession(gearless, twin);
    const coreBefore = await sessionSkillXp(twin.id, 'core');

    const editSetTwo = (sets: SetShape[]) => sets.map((set) => (set.position === 1 ? { ...set, reps: 12 } : set));
    await edit(geared, session, editSetTwo(session.sets));
    await edit(gearless, twin, editSetTwo(twin.sets));

    const gearlessCore = await skillXpByPosition(twin.id, 'core');
    const coreAfter = gearlessCore.reduce((sum, xp) => sum + xp, 0);
    expect(Math.round(coreAfter / 10)).not.toBe(Math.round(coreBefore / 10));
    const shares = (await skillXpByPosition(session.id, 'core')).map((xp, position) => xp - gearlessCore[position]);
    expect(shares).toHaveLength(3);
    for (const share of shares) expect(share).toBeGreaterThanOrEqual(0);
    expect(shares.reduce((sum, share) => sum + share, 0)).toBe(Math.round(coreAfter / 10));
  });

  it('clears a stale bonus when a squat session is edited into a bench session', async () => {
    const { geared, gearedSessionForLoot } = await twins();
    await equip(geared, gearedSessionForLoot, 'belt', 'ascendant_belt');
    const session = squatSession();
    await postSession(geared, session);
    expect((await storedSession(session.id)).summary.gearBonusBySkill).toHaveProperty('core');

    await edit(
      geared,
      session,
      session.sets.map((set) => ({ ...set, exerciseId: benchId, weightKg: 80 })),
    );

    expect((await storedSession(session.id)).summary.gearBonusBySkill).toEqual({});
  });

  it('gives no bonus to a session stored before gear existed', async () => {
    const { geared, gearless, gearedSessionForLoot } = await twins();
    await equip(geared, gearedSessionForLoot, 'belt', 'ascendant_belt');
    const session = squatSession();
    const twin = withFreshIds(session);
    await postSession(geared, session);
    await postSession(gearless, twin);

    await db`update public.sessions set gear_loadout = null where id = ${session.id}`;
    expect((await rebuildCaches(geared.id)).status).toBe(200);

    expect((await storedSession(session.id)).summary.gearBonusBySkill).toEqual({});
    expect(await allSkillXpByPosition(session.id)).toEqual(await allSkillXpByPosition(twin.id));
    expect(await userSkillXp(geared.id, 'core')).toBe(await userSkillXp(gearless.id, 'core'));
  });

  it('keeps the bonus through rebuild-caches after the loadout changes', async () => {
    const { geared, gearedSessionForLoot } = await twins();
    await equip(geared, gearedSessionForLoot, 'belt', 'ascendant_belt');
    const session = squatSession();
    await postSession(geared, session);
    await unequip(geared, 'belt');

    const before = await normalizedSnapshot(geared.id);
    expect((await rebuildCaches(geared.id)).status).toBe(200);
    expect(await normalizedSnapshot(geared.id)).toEqual(before);
    expect((await storedSession(session.id)).summary.gearBonusBySkill).toHaveProperty('core');
  });
});
