import { beforeAll, describe, expect, it } from 'vitest';
import { queryRarestRecentDrop } from '../../web/src/lib/collection/item-rules.ts';
import { createTestUser, db, type TestUser } from './local-stack.ts';

const WINDOW_START = '2026-09-15T00:00:00Z';
const NEWER_COMMONS = 110;

async function addDrop(user: TestUser, itemKey: string, rollIndex: number, createdAt: string, revoked = false) {
  const [roll] = await db`
    insert into public.loot_rolls
      (user_id, session_id, set_id, kind, local_date, roll_index, drop_table_id, chance, hit, loot_version, created_at)
    select ${user.id}, gen_random_uuid(), gen_random_uuid(), 'regular', '2026-10-01', ${rollIndex},
           t.id, 0.1, true, 1, ${createdAt}
    from public.drop_tables t where t.key = 'regular'
    returning id, session_id, set_id`;
  const [drop] = await db`
    insert into public.drops
      (user_id, loot_roll_id, session_id, set_id, item_id, quantity, source, created_at,
       revoked_at, revoke_reason, revoked_quantity)
    select ${user.id}, ${roll.id}, ${roll.session_id}, ${roll.set_id}, i.id, 1, 'regular', ${createdAt},
           ${revoked ? createdAt : null}, ${revoked ? 'set_removed' : null}, ${revoked ? 1 : null}
    from public.items i where i.key = ${itemKey}
    returning id`;
  return drop.id as string;
}

describe('the rarest recent drop on Train', () => {
  let owner: TestUser;
  let tied: TestUser;
  let stranger: TestUser;

  beforeAll(async () => {
    [owner, tied, stranger] = await Promise.all([createTestUser(), createTestUser(), createTestUser()]);
    await addDrop(owner, 'spotter_pup', 0, '2026-10-01T08:00:00Z');
    await addDrop(owner, 'plate_crab', 1, '2026-10-02T08:00:00Z', true);
    for (let index = 0; index < NEWER_COMMONS; index += 1) {
      await addDrop(owner, 'grinder_scraps', 10 + index, `2026-10-03T08:${String(index % 60).padStart(2, '0')}:00Z`);
    }
    await addDrop(tied, 'spotter_pup', 0, '2026-10-05T08:00:00Z');
    await addDrop(tied, 'plate_crab', 1, '2026-10-05T08:00:00Z');
  });

  it('ranks on the server, so a rare drop behind more than a hundred newer commons still wins', async () => {
    const rarest = await queryRarestRecentDrop(owner.client, WINDOW_START);
    expect(rarest).toMatchObject({ key: 'spotter_pup', name: 'Spotter Pup', rarity: 'legendary' });
  });

  it('breaks a tie of rarity and time by the drop id, so every read agrees', async () => {
    const [expected] = await db`
      select i.key from public.drops d join public.items i on i.id = d.item_id
      where d.user_id = ${tied.id} order by d.id desc limit 1`;
    const reads = await Promise.all([1, 2, 3].map(() => queryRarestRecentDrop(tied.client, WINDOW_START)));
    expect(reads.map((item) => item?.key)).toEqual([expected.key, expected.key, expected.key]);
  });

  it('has nothing for a stranger or before the window', async () => {
    expect(await queryRarestRecentDrop(stranger.client, WINDOW_START)).toBeNull();
    expect(await queryRarestRecentDrop(owner.client, '2026-10-04T00:00:00Z')).toBeNull();
  });
});
