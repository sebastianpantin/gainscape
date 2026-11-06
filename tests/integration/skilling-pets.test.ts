import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { builtInExerciseId, db, grantDrop, hmacRngFor, postFunction } from './local-stack.ts';
import {
  aSet,
  expectLedgerMatchesItems,
  payloadAt,
  postSession,
  rollsOf,
  startsOnOneLocalDay,
  trackedUsers,
} from './session-support.ts';

const SURE_HIT_BELOW = 0.00002;

const { freshUser, checkAndClear } = trackedUsers(expectLedgerMatchesItems);

let benchId: string;

function setIdThatHitsAPet(userId: string): string {
  const rngFor = hmacRngFor(userId);
  for (;;) {
    const setId = randomUUID();
    if (rngFor(setId, 'pet').next() < SURE_HIT_BELOW) return setId;
  }
}

async function heldPets(userId: string) {
  return await db`
    select i.key, s.key as skill, u.quantity
    from public.user_items u
    join public.items i on i.id = u.item_id
    join public.skills s on s.id = i.skill_id
    where u.user_id = ${userId}
    order by i.key`;
}

async function trainedSkills(setId: string): Promise<string[]> {
  const rows = await db`
    select s.key from public.set_skill_xp x join public.skills s on s.id = x.skill_id
    where x.set_id = ${setId} and x.xp > 0 order by s.key`;
  return rows.map((row) => row.key as string);
}

beforeAll(async () => {
  benchId = await builtInExerciseId('barbell_bench_press');
});

afterEach(async () => {
  await checkAndClear();
});

afterAll(async () => {
  await db.end();
});

describe('skilling pets', () => {
  it('drops the pet of a skill the set trained and shows it in the session drops', async () => {
    const user = await freshUser();
    const [start] = startsOnOneLocalDay(1);
    const payload = payloadAt(start, [aSet(benchId, 0, 60, { id: setIdThatHitsAPet(user.id) })]);
    const response = await postSession(user, payload);

    const [pet] = await heldPets(user.id);
    expect(pet.quantity).toBe(1);
    expect(await trainedSkills(payload.sets[0].id)).toContain(pet.skill);
    expect((response.body.drops ?? []).filter((drop) => drop.source === 'pet')).toEqual([
      expect.objectContaining({ itemKey: pet.key, quantity: 1 }),
    ]);
    const [roll] = await rollsOf(user.id, ['pet']);
    expect(roll).toMatchObject({ set_id: payload.sets[0].id, hit: true, roll_index: 0 });
    expect(roll.chance).toBeGreaterThan(0);
  });

  it('never rolls for a pet the user already holds', async () => {
    const user = await freshUser();
    const [earlier, later] = startsOnOneLocalDay(2);
    const first = payloadAt(earlier, [aSet(benchId, 0, 60)]);
    await postSession(user, first);
    for (const skill of await trainedSkills(first.sets[0].id)) {
      const [pet] = await db`
        select i.key from public.items i join public.skills s on s.id = i.skill_id where s.key = ${skill}`;
      await grantDrop(user.id, first.id, randomUUID(), pet.key, 1, 'pet');
    }

    const second = payloadAt(later, [aSet(benchId, 0, 60, { id: setIdThatHitsAPet(user.id) })]);
    await postSession(user, second);

    expect((await rollsOf(user.id, ['pet'])).filter((roll) => roll.session_id === second.id)).toEqual([]);
    expect((await rollsOf(user.id, ['regular'])).filter((roll) => roll.session_id === second.id)).toHaveLength(1);
  });

  it('takes the pet back when its session is deleted', async () => {
    const user = await freshUser();
    const [start] = startsOnOneLocalDay(1);
    const payload = payloadAt(start, [aSet(benchId, 0, 60, { id: setIdThatHitsAPet(user.id) })]);
    await postSession(user, payload);
    expect(await heldPets(user.id)).toHaveLength(1);

    expect((await postFunction('delete-session', user.accessToken, { sessionId: payload.id })).status).toBe(200);

    expect((await heldPets(user.id)).map((pet) => pet.quantity)).toEqual([0]);
    const [drop] = await db`select revoke_reason from public.drops where user_id = ${user.id} and source = 'pet'`;
    expect(drop.revoke_reason).toBe('session_deleted');
  });
});
