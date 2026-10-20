import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type LootStatsRow, queryLootStats } from '../../web/src/lib/stats/loot-stats-rules.ts';
import { builtInExerciseId, createTestUser, db, postFunction, type TestUser } from './local-stack.ts';
import { aSet, payloadAt, postSession, startsOnOneLocalDay, TIMEZONE } from './session-support.ts';

interface StoredRoll {
  session_kept: boolean;
  kind: 'regular' | 'pr';
  chance: string;
  hit: boolean;
}

async function storedRollsInRollOrder(userId: string): Promise<StoredRoll[]> {
  return await db<StoredRoll[]>`
    select exists (select 1 from public.sessions s where s.id = r.session_id) as session_kept,
           r.kind, r.chance::text as chance, r.hit
    from public.loot_rolls r
    where r.user_id = ${userId}
    order by r.created_at, r.local_date, r.roll_index, r.id`;
}

function longestRunOfMisses(rolls: readonly StoredRoll[]): number {
  let longest = 0;
  let current = 0;
  for (const roll of rolls.filter((each) => each.kind === 'regular')) {
    current = roll.hit ? 0 : current + 1;
    longest = Math.max(longest, current);
  }
  return longest;
}

async function regularDryRolls(userId: string): Promise<number> {
  const [luck] = await db`
    select l.dry_rolls from public.drop_luck l join public.drop_tables t on t.id = l.drop_table_id
    where l.user_id = ${userId} and t.key = 'regular'`;
  return luck?.dry_rolls ?? 0;
}

function lootStatsFromRolls(rolls: readonly StoredRoll[], dryRolls: number, workoutsWithRolls: number): LootStatsRow {
  const kept = rolls.filter((roll) => roll.session_kept);
  return {
    workouts_with_rolls: workoutsWithRolls,
    rolls: kept.length,
    hits: kept.filter((roll) => roll.hit).length,
    expected_drops: Number(kept.reduce((sum, roll) => sum + Number(roll.chance), 0).toFixed(5)),
    longest_dry_streak: longestRunOfMisses(rolls),
    current_dry_streak: dryRolls,
  };
}

describe('loot stats', () => {
  let owner: TestUser;
  let stranger: TestUser;
  let benchId: string;

  beforeAll(async () => {
    [owner, stranger] = await Promise.all([createTestUser(TIMEZONE), createTestUser(TIMEZONE)]);
    benchId = await builtInExerciseId('barbell_bench_press');
  });

  afterAll(async () => {
    await db.end();
  });

  async function lootStatsOf(user: TestUser): Promise<LootStatsRow> {
    const stats = await queryLootStats(user.client, new AbortController().signal);
    return { ...stats, expected_drops: Number(stats.expected_drops) };
  }

  it('counts the rolls the server stored, keeps a deleted workout in the dry streaks only, and reads the luck counter', async () => {
    const [firstStart, secondStart] = startsOnOneLocalDay(2) as [Date, Date];
    await postSession(
      owner,
      payloadAt(firstStart, [aSet(benchId, 0, 60, { reps: 5 }), aSet(benchId, 1, 60, { reps: 5 })]),
    );
    const deleted = payloadAt(secondStart, [aSet(benchId, 0, 60, { reps: 5 }), aSet(benchId, 1, 60, { reps: 5 })]);
    await postSession(owner, deleted);

    const rollsBefore = await storedRollsInRollOrder(owner.id);
    expect(rollsBefore.filter((roll) => roll.kind === 'regular')).toHaveLength(4);
    expect(await lootStatsOf(owner)).toEqual(lootStatsFromRolls(rollsBefore, await regularDryRolls(owner.id), 2));

    const removed = await postFunction('delete-session', owner.accessToken, { sessionId: deleted.id });
    expect(removed.status, removed.rawBody).toBe(200);

    const rollsAfter = await storedRollsInRollOrder(owner.id);
    expect(rollsAfter).toHaveLength(rollsBefore.length);
    const afterDelete = await lootStatsOf(owner);
    expect(afterDelete).toEqual(lootStatsFromRolls(rollsAfter, await regularDryRolls(owner.id), 1));
    expect(afterDelete.rolls).toBeLessThan(rollsBefore.length);

    expect(await lootStatsOf(stranger)).toEqual({
      workouts_with_rolls: 0,
      rolls: 0,
      hits: 0,
      expected_drops: 0,
      longest_dry_streak: 0,
      current_dry_streak: 0,
    });
  });
});
