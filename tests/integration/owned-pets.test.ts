import { beforeAll, describe, expect, it } from 'vitest';
import { queryOwnedPets } from '../../web/src/lib/collection/item-rules.ts';
import { createTestUser, db, type TestUser } from './local-stack.ts';

async function hold(user: TestUser, key: string, quantity: number, firstObtainedAt: string) {
  const [item] = await db`select id from public.items where key = ${key}`;
  await db`
    insert into public.user_items (user_id, item_id, quantity, first_obtained_at)
    values (${user.id}, ${item.id}, ${quantity}, ${firstObtainedAt})`;
  return item.id as string;
}

describe('owned pets for the Today companion', () => {
  let owner: TestUser;
  let other: TestUser;
  let pupId: string;

  beforeAll(async () => {
    [owner, other] = await Promise.all([createTestUser(), createTestUser()]);
    pupId = await hold(owner, 'spotter_pup', 1, '2026-10-01T08:00:00Z');
    await hold(owner, 'plate_crab', 0, '2026-10-02T08:00:00Z');
    await hold(owner, 'grinder_scraps', 5, '2026-10-03T08:00:00Z');
    await hold(other, 'chalk_sprite', 1, '2026-10-04T08:00:00Z');
  });

  it("reads only the owner's pets that are still held", async () => {
    const pets = await queryOwnedPets(owner.client, owner.id);
    expect(pets.items.map((item) => item.key)).toEqual(['spotter_pup']);
    expect(pets.items[0]).toMatchObject({ kind: 'pet', name: 'Spotter Pup' });
    expect(pets.held.get(pupId)).toMatchObject({ itemId: pupId, quantity: 1 });
    expect(Date.parse(pets.held.get(pupId)!.firstObtainedAt)).toBe(Date.parse('2026-10-01T08:00:00Z'));
  });

  it("cannot read another user's pets", async () => {
    expect((await queryOwnedPets(owner.client, other.id)).items).toEqual([]);
  });
});
