import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { builtInExerciseId, createTestUser, db } from './local-stack.ts';
import { aSet, HOUR_MS, payloadAt, postSession } from './session-support.ts';

beforeAll(async () => {
  const rowId = await builtInExerciseId('barbell_row');
  const user = await createTestUser();
  await postSession(
    user,
    payloadAt(
      new Date(Date.now() - HOUR_MS),
      Array.from({ length: 5 }, (_, position) => aSet(rowId, position, 60)),
    ),
  );
});

afterAll(async () => {
  await db.end();
});

describe('immutability of the whole loot tables', () => {
  it('rejects truncating the loot rolls or the ledger', async () => {
    const [rollsBefore] = await db`select count(*)::int as count from public.loot_rolls`;
    const [ledgerBefore] = await db`select count(*)::int as count from public.item_ledger`;
    await expect(db`truncate public.loot_rolls cascade`).rejects.toThrow('append_only');
    await expect(db`truncate public.item_ledger`).rejects.toThrow('append_only');
    expect((await db`select count(*)::int as count from public.loot_rolls`)[0]).toEqual(rollsBefore);
    expect((await db`select count(*)::int as count from public.item_ledger`)[0]).toEqual(ledgerBefore);
    expect(rollsBefore.count).toBeGreaterThan(0);
  });
});
