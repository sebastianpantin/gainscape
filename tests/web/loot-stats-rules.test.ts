import { describe, expect, it } from 'vitest';
import { type LootStatsRow, lootStatsRowSchema, lootStatsView } from '../../web/src/lib/stats/loot-stats-rules.ts';

const stats: LootStatsRow = {
  workouts_with_rolls: 4,
  rolls: 12,
  drops: 3,
  expected_drops: 2.4,
  longest_dry_streak: 7,
  current_dry_streak: 1,
};

describe('lootStatsRowSchema', () => {
  it('reads the RPC answer, with the expected drops as a number or a numeric string', () => {
    expect(lootStatsRowSchema.parse(stats)).toEqual(stats);
    expect(lootStatsRowSchema.parse({ ...stats, expected_drops: '2.40000' }).expected_drops).toBe('2.40000');
    expect(lootStatsRowSchema.safeParse({ ...stats, rolls: undefined }).success).toBe(false);
  });
});

describe('lootStatsView', () => {
  it('lists the rolls, drops against the odds, per workout, and both dry streaks', () => {
    expect(lootStatsView(stats)?.entries).toEqual([
      { label: 'Loot rolls', value: '12 in 4 workouts' },
      { label: 'Drops', value: '3, expected 2.4' },
      { label: 'Drops per workout', value: '0.75, expected 0.60' },
      { label: 'Longest dry streak', value: '7 loot rolls' },
      { label: 'Current dry streak', value: '1 loot roll' },
    ]);
  });

  it('reads a numeric string for the expected drops', () => {
    expect(lootStatsView({ ...stats, expected_drops: '2.40000' })?.entries[1]?.value).toBe('3, expected 2.4');
  });

  it('says whether the drops beat the odds, by how many, or matched them', () => {
    expect(lootStatsView(stats)?.luckText).toBe('Luckier than expected by 0.6 drops.');
    expect(lootStatsView({ ...stats, drops: 1 })?.luckText).toBe('Unluckier than expected by 1.4 drops.');
    expect(lootStatsView({ ...stats, drops: 2, expected_drops: 1.9 })?.luckText).toBe(
      'Luckier than expected by 0.1 drops.',
    );
    expect(lootStatsView({ ...stats, drops: 2, expected_drops: 1.96 })?.luckText).toBe('Right on the odds.');
  });

  it('counts one workout and one drop in the singular', () => {
    expect(lootStatsView({ ...stats, workouts_with_rolls: 1, rolls: 1, drops: 1 })?.entries.slice(0, 2)).toEqual([
      { label: 'Loot rolls', value: '1 in 1 workout' },
      { label: 'Drops', value: '1, expected 2.4' },
    ]);
  });

  it('keeps the dry streaks when every workout that rolled was deleted', () => {
    const view = lootStatsView({ ...stats, workouts_with_rolls: 0, rolls: 0, drops: 0, expected_drops: 0 });
    expect(view?.entries).toEqual([
      { label: 'Loot rolls', value: '0 in 0 workouts' },
      { label: 'Drops', value: '0, expected 0.0' },
      { label: 'Longest dry streak', value: '7 loot rolls' },
      { label: 'Current dry streak', value: '1 loot roll' },
    ]);
    expect(view?.luckText).toBeNull();
  });

  it('shows nothing before the first loot roll', () => {
    expect(
      lootStatsView({
        workouts_with_rolls: 0,
        rolls: 0,
        drops: 0,
        expected_drops: 0,
        longest_dry_streak: 0,
        current_dry_streak: 0,
      }),
    ).toBeNull();
  });
});
