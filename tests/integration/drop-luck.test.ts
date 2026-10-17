import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryDryRolls } from '../../web/src/lib/collection/luck-rules.ts';
import { createTestUser, db, type TestUser } from './local-stack.ts';

let owner: TestUser;
let stranger: TestUser;

async function setDryRolls(userId: string, tableKey: string, dryRolls: number) {
  await db`
    insert into public.drop_luck (user_id, drop_table_id, dry_rolls)
    select ${userId}, id, ${dryRolls} from public.drop_tables where key = ${tableKey}
    on conflict (user_id, drop_table_id) do update set dry_rolls = excluded.dry_rolls`;
}

beforeAll(async () => {
  owner = await createTestUser();
  stranger = await createTestUser();
});

afterAll(async () => {
  await db.end();
});

describe('the luck meter dry rolls', () => {
  it('counts zero before the first roll', async () => {
    expect(await queryDryRolls(owner.client, owner.id)).toBe(0);
  });

  it('reads the regular table and ignores the rare one', async () => {
    await setDryRolls(owner.id, 'rare', 7);
    expect(await queryDryRolls(owner.client, owner.id)).toBe(0);
    await setDryRolls(owner.id, 'regular', 3);
    expect(await queryDryRolls(owner.client, owner.id)).toBe(3);
  });

  it("never shows another player's dry rolls", async () => {
    await setDryRolls(owner.id, 'regular', 4);
    expect(await queryDryRolls(stranger.client, owner.id)).toBe(0);
  });
});
