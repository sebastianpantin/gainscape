import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  chance,
  DEFAULT_LOOT,
  type LootCandidate,
  type LootConfig,
  lootCandidates,
  lootRollKey,
  pickEntry,
  qualifies,
  quantityFor,
  replayHistory,
  revocationReason,
  rollSessionLoot,
  type RollKind,
  type SessionInput,
  sfc32FromSeed,
} from '@domain/index.ts';
import { aBout, aSet, catalog, DAY_MS, hard, TEST_BALANCE } from './fixtures.ts';
import {
  candidate,
  FIXTURE_TABLES,
  fixedRngFor,
  fixedSeed,
  FRESH_DAY,
  REGULAR_FIXTURE,
  scriptedRng,
} from './loot-fixtures.ts';

const UNCAPPED: LootConfig = { ...DEFAULT_LOOT, regularRollsPerDay: 1_000_000, prRollsPerDay: 1_000_000 };
const HIT = 0;
const MISS = 0.999999;

function analyticRegularHitRate(cfg: LootConfig): number {
  let expectedRollsPerHit = 0;
  let survival = 1;
  for (let dry = 0; dry < 10_000; dry += 1) {
    expectedRollsPerHit += survival;
    survival *= 1 - chance(dry, cfg);
  }
  return 1 / expectedRollsPerHit;
}

const candidateArb = fc.record({
  effectiveReps: fc.integer({ min: 0, max: 5 }),
  personalRecord: fc.boolean(),
  builtIn: fc.boolean(),
});

describe('chance and bad-luck protection', () => {
  it('starts at the base chance, steps by 3 points and caps at 40%', () => {
    expect([
      chance(0, DEFAULT_LOOT),
      chance(1, DEFAULT_LOOT),
      chance(10, DEFAULT_LOOT),
      chance(50, DEFAULT_LOOT),
    ]).toEqual([0.1, 0.13, 0.4, 0.4]);
  });

  it('is monotonic in the dry streak up to the cap', () => {
    for (let dry = 0; dry < 60; dry += 1) {
      expect(chance(dry + 1, DEFAULT_LOOT)).toBeGreaterThanOrEqual(chance(dry, DEFAULT_LOOT));
      expect(chance(dry, DEFAULT_LOOT)).toBeLessThanOrEqual(DEFAULT_LOOT.maxChance);
    }
  });

  it('rolls at chance(dry), resets the streak on a hit and extends it on a miss', () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { minLength: 1, maxLength: 40 }), fc.nat(30), (outcomes, startDry) => {
        const candidates = outcomes.map((_, index) => candidate(`s${index}`, index));
        const { rolls, dryRolls } = rollSessionLoot(
          candidates,
          FIXTURE_TABLES,
          { ...FRESH_DAY, dryRolls: startDry },
          UNCAPPED,
          (setId) => scriptedRng([outcomes[Number(setId.slice(1))] ? HIT : MISS, 0.5, 0.5]),
        );
        let dry = startDry;
        rolls.forEach((roll, index) => {
          expect(roll.chance).toBe(chance(dry, UNCAPPED));
          expect(roll.hit).toBe(outcomes[index]);
          expect(roll.drop === null).toBe(!outcomes[index]);
          dry = roll.hit ? 0 : dry + 1;
        });
        expect(dryRolls).toBe(dry);
      }),
    );
  });
});

describe('daily caps', () => {
  it('rolls min(cap - used, eligible) of each kind with consecutive roll indexes', () => {
    fc.assert(
      fc.property(
        fc.array(candidateArb, { maxLength: 12 }),
        fc.integer({ min: 0, max: 7 }),
        fc.integer({ min: 0, max: 3 }),
        fc.array(fc.tuple(fc.nat(11), fc.constantFrom<RollKind>('regular', 'pr')), { maxLength: 6 }),
        (shapes, regularUsed, prUsed, rolledPairs) => {
          const candidates = shapes.map((shape, index) => candidate(`s${index}`, index, shape));
          const alreadyRolled = new Set(rolledPairs.map(([index, kind]) => lootRollKey(`s${index}`, kind)));
          const eligible = (kind: RollKind) =>
            candidates.filter(
              (entry) => qualifies(kind, entry, DEFAULT_LOOT) && !alreadyRolled.has(lootRollKey(entry.setId, kind)),
            ).length;
          const { rolls } = rollSessionLoot(
            candidates,
            FIXTURE_TABLES,
            { regularUsed, prUsed, dryRolls: 0, alreadyRolled },
            DEFAULT_LOOT,
            fixedRngFor('caps'),
          );
          const regular = rolls.filter((roll) => roll.kind === 'regular');
          const pr = rolls.filter((roll) => roll.kind === 'pr');
          expect(regular).toHaveLength(
            Math.min(Math.max(0, DEFAULT_LOOT.regularRollsPerDay - regularUsed), eligible('regular')),
          );
          expect(pr).toHaveLength(Math.min(Math.max(0, DEFAULT_LOOT.prRollsPerDay - prUsed), eligible('pr')));
          expect(regular.map((roll) => roll.rollIndex)).toEqual(regular.map((_, index) => regularUsed + index));
          expect(pr.map((roll) => roll.rollIndex)).toEqual(pr.map((_, index) => prUsed + index));
          expect(pr.every((roll) => roll.hit && roll.chance === 1 && roll.tableId === 'table-rare')).toBe(true);
        },
      ),
    );
  });

  it('gives the 6th qualifying set of a day no roll', () => {
    const candidates = Array.from({ length: 6 }, (_, index) => candidate(`s${index}`, index));
    const { rolls } = rollSessionLoot(candidates, FIXTURE_TABLES, FRESH_DAY, DEFAULT_LOOT, fixedRngFor('sixth'));
    expect(rolls.map((roll) => roll.setId)).toEqual(['s0', 's1', 's2', 's3', 's4']);
    const later = rollSessionLoot(
      [candidate('s5', 0)],
      FIXTURE_TABLES,
      { ...FRESH_DAY, regularUsed: 5 },
      DEFAULT_LOOT,
      fixedRngFor('sixth'),
    );
    expect(later.rolls).toEqual([]);
  });
});

describe('qualification', () => {
  const first = Date.parse('2026-09-01T18:00:00.000Z');
  const sessionAt = (day: number, sets: SessionInput['sets']): SessionInput => ({
    id: `session-${day}`,
    startedAt: new Date(first + day * DAY_MS).toISOString(),
    sets,
  });

  function rollsFor(sessions: SessionInput[]) {
    const replay = replayHistory(sessions, catalog, TEST_BALANCE, { skillXp: {}, bodyweightKg: 80 });
    const last = replay.sessions.at(-1)!;
    const candidates = lootCandidates(last.outputs.sets, catalog);
    return { candidates, ...rollSessionLoot(candidates, FIXTURE_TABLES, FRESH_DAY, DEFAULT_LOOT, fixedRngFor('q')) };
  }

  it('gives warm-ups, sets beyond the RIR window and unrated cold-start sets no rolls', () => {
    const { candidates, rolls } = rollsFor([
      sessionAt(0, [
        aSet('bench', 40, 10, hard, { isWarmup: true }),
        aSet('bench', 60, 8, { type: 'rir', value: 6 }),
        aSet('bench', 60, 8, null),
      ]),
    ]);
    expect(candidates.map((entry) => entry.effectiveReps)).toEqual([0, 0, 0]);
    expect(rolls).toEqual([]);
  });

  it('gives an easy set one effective rep and a regular roll', () => {
    const { candidates, rolls } = rollsFor([sessionAt(0, [aSet('bench', 60, 8, { type: 'level', level: 'easy' })])]);
    expect(candidates.map((entry) => entry.effectiveReps)).toEqual([1]);
    expect(rolls.map((roll) => roll.kind)).toEqual(['regular']);
  });

  it('gives a baseline session regular rolls but no PR rolls', () => {
    const { candidates, rolls } = rollsFor([sessionAt(0, [aSet('bench', 60, 5, hard), aSet('squat', 100, 5, hard)])]);
    expect(candidates.some((entry) => entry.personalRecord)).toBe(false);
    expect(rolls.map((roll) => roll.kind)).toEqual(['regular', 'regular']);
  });

  it('gives a PR on a built-in exercise a PR roll and a custom-exercise PR a regular roll only', () => {
    const { candidates, rolls } = rollsFor([
      sessionAt(0, [aSet('bench', 60, 5, hard), aSet('custom-press', 40, 5, hard)]),
      sessionAt(1, [aSet('bench', 80, 5, hard), aSet('custom-press', 60, 5, hard)]),
    ]);
    expect(candidates.map((entry) => [entry.personalRecord, entry.builtIn])).toEqual([
      [true, true],
      [true, false],
    ]);
    expect(rolls.map((roll) => [roll.setId, roll.kind])).toEqual([
      [candidates[0].setId, 'regular'],
      [candidates[0].setId, 'pr'],
      [candidates[1].setId, 'regular'],
    ]);
  });

  it('gives a steady bout of 10 counted minutes a regular roll and one of 9 minutes none', () => {
    const { candidates, rolls } = rollsFor([sessionAt(0, [aBout('run', 600, null), aBout('run', 540, null)])]);
    expect(candidates.map((entry) => [entry.kind, entry.countedWorkS, entry.interval])).toEqual([
      ['cardio', 600, false],
      ['cardio', 540, false],
    ]);
    expect(rolls.map((roll) => [roll.setId, roll.kind])).toEqual([[candidates[0].setId, 'regular']]);
  });

  it('gives an interval bout with 4 work minutes a regular roll and one with less none', () => {
    const enough = aBout('sprints', 450, null, { interval: { workS: 30, restS: 30, rounds: 8 } });
    const short = aBout('sprints', 390, null, { interval: { workS: 30, restS: 30, rounds: 7 } });
    const { candidates, rolls } = rollsFor([sessionAt(0, [enough, short])]);
    expect(candidates.map((entry) => [entry.countedWorkS, entry.interval])).toEqual([
      [240, true],
      [210, true],
    ]);
    expect(rolls.map((roll) => roll.setId)).toEqual([enough.id]);
  });

  it('gives a cardio record on a built-in activity a PR roll and one on a custom activity none', () => {
    const { candidates, rolls } = rollsFor([
      sessionAt(0, [aBout('run', 1800, null), aBout('custom-run', 1800, null)]),
      sessionAt(1, [aBout('run', 2400, null), aBout('custom-run', 2400, null)]),
    ]);
    expect(candidates.map((entry) => [entry.personalRecord, entry.builtIn])).toEqual([
      [true, true],
      [true, false],
    ]);
    expect(rolls.map((roll) => [roll.setId, roll.kind])).toEqual([
      [candidates[0].setId, 'regular'],
      [candidates[0].setId, 'pr'],
      [candidates[1].setId, 'regular'],
    ]);
  });

  it('orders candidates by set position', () => {
    const sets = [aSet('bench', 60, 5, hard, { position: 3 }), aSet('squat', 90, 5, hard, { position: 1 })];
    const { candidates } = rollsFor([sessionAt(0, sets)]);
    expect(candidates.map((entry) => entry.position)).toEqual([1, 3]);
  });
});

describe('rngFor discipline', () => {
  it('asks for at most one stream per set and kind, only for qualifying sets that have not rolled', () => {
    fc.assert(
      fc.property(
        fc.array(candidateArb, { maxLength: 10 }),
        fc.array(fc.tuple(fc.nat(9), fc.constantFrom<RollKind>('regular', 'pr')), { maxLength: 5 }),
        fc.integer({ min: 0, max: 6 }),
        (shapes, rolledPairs, regularUsed) => {
          const candidates = shapes.map((shape, index) => candidate(`s${index}`, index, shape));
          const byId = new Map(candidates.map((entry) => [entry.setId, entry]));
          const alreadyRolled = new Set(rolledPairs.map(([index, kind]) => lootRollKey(`s${index}`, kind)));
          const calls: string[] = [];
          const seeded = fixedRngFor('discipline');
          rollSessionLoot(
            candidates,
            FIXTURE_TABLES,
            { ...FRESH_DAY, regularUsed, alreadyRolled },
            DEFAULT_LOOT,
            (setId, kind) => {
              const entry = byId.get(setId);
              expect(entry).toBeDefined();
              expect(qualifies(kind, entry!, DEFAULT_LOOT)).toBe(true);
              expect(alreadyRolled.has(lootRollKey(setId, kind))).toBe(false);
              calls.push(lootRollKey(setId, kind));
              return seeded(setId, kind);
            },
          );
          expect(new Set(calls).size).toBe(calls.length);
        },
      ),
    );
  });
});

describe('picking entries', () => {
  it('matches each weight share within half a percentage point over 200 000 draws', () => {
    const rng = sfc32FromSeed(fixedSeed('pick-distribution'));
    const counts = new Map<string, number>();
    const draws = 200_000;
    for (let draw = 0; draw < draws; draw += 1) {
      const entry = pickEntry(REGULAR_FIXTURE, rng.next());
      counts.set(entry.itemKey, (counts.get(entry.itemKey) ?? 0) + 1);
    }
    const total = REGULAR_FIXTURE.entries.reduce((sum, entry) => sum + entry.weight, 0);
    for (const entry of REGULAR_FIXTURE.entries) {
      expect(Math.abs((counts.get(entry.itemKey) ?? 0) / draws - entry.weight / total)).toBeLessThan(0.005);
    }
  });

  it('keeps quantities within [min, max] and reaches both ends', () => {
    const rng = sfc32FromSeed(fixedSeed('quantities'));
    const scraps = REGULAR_FIXTURE.entries.find((entry) => entry.itemKey === 'scraps')!;
    const seen = new Set<number>();
    for (let draw = 0; draw < 10_000; draw += 1) seen.add(quantityFor(scraps, rng.next()));
    expect([...seen].sort()).toEqual([2, 3, 4, 5]);
    expect(quantityFor(scraps, 0)).toBe(2);
    expect(quantityFor(scraps, 0.999999)).toBe(5);
  });

  it('walks entries in item-key order regardless of table order', () => {
    const reversed = { ...REGULAR_FIXTURE, entries: [...REGULAR_FIXTURE.entries].reverse() };
    for (const u of [0, 0.05, 0.1, 0.5, 0.75, 0.999]) {
      expect(pickEntry(reversed, u)).toEqual(pickEntry(REGULAR_FIXTURE, u));
    }
    expect(pickEntry(REGULAR_FIXTURE, 0).itemKey).toBe('belt');
    expect(pickEntry(REGULAR_FIXTURE, 0.999999).itemKey).toBe('shards');
  });
});

describe('long-run regular hit rate', () => {
  it('stays within half a percentage point of the analytic rate over 200 000 rolls', () => {
    const analytic = analyticRegularHitRate(DEFAULT_LOOT);
    expect(analytic).toBeCloseTo(0.1907, 4);
    const rng = sfc32FromSeed(fixedSeed('hit-rate'));
    const candidates: LootCandidate[] = Array.from({ length: 200_000 }, (_, index) => candidate(`s${index}`, index));
    const { rolls } = rollSessionLoot(candidates, FIXTURE_TABLES, FRESH_DAY, UNCAPPED, () => rng);
    expect(rolls).toHaveLength(200_000);
    const hitRate = rolls.filter((roll) => roll.hit).length / rolls.length;
    expect(Math.abs(hitRate - analytic)).toBeLessThan(0.005);
  });
});

describe('golden session', () => {
  const goldenCandidates = [
    candidate('warmup-1', 0, { effectiveReps: 0 }),
    candidate('warmup-2', 1, { effectiveReps: 0 }),
    candidate('easy', 2, { effectiveReps: 0 }),
    candidate('work-1', 3),
    candidate('work-pr', 4, { personalRecord: true }),
    candidate('work-2', 5, { effectiveReps: 1 }),
    candidate('custom-pr', 6, { personalRecord: true, builtIn: false }),
  ];
  const goldenDay = { regularUsed: 1, prUsed: 0, dryRolls: 6, alreadyRolled: new Set<string>() };
  const roll = () =>
    rollSessionLoot(goldenCandidates, FIXTURE_TABLES, goldenDay, DEFAULT_LOOT, fixedRngFor('golden-3'));

  it('pins the exact rolls', () => {
    expect(roll()).toEqual({
      rolls: [
        {
          setId: 'work-1',
          kind: 'regular',
          tableId: 'table-regular',
          rollIndex: 1,
          chance: 0.28,
          hit: false,
          drop: null,
        },
        {
          setId: 'work-pr',
          kind: 'regular',
          tableId: 'table-regular',
          rollIndex: 2,
          chance: 0.31,
          hit: true,
          drop: { itemId: 'item-scraps', itemKey: 'scraps', quantity: 2 },
        },
        {
          setId: 'work-pr',
          kind: 'pr',
          tableId: 'table-rare',
          rollIndex: 0,
          chance: 1,
          hit: true,
          drop: { itemId: 'item-ingot', itemKey: 'ingot', quantity: 2 },
        },
        {
          setId: 'work-2',
          kind: 'regular',
          tableId: 'table-regular',
          rollIndex: 3,
          chance: 0.1,
          hit: true,
          drop: { itemId: 'item-scraps', itemKey: 'scraps', quantity: 2 },
        },
        {
          setId: 'custom-pr',
          kind: 'regular',
          tableId: 'table-regular',
          rollIndex: 4,
          chance: 0.1,
          hit: false,
          drop: null,
        },
      ],
      dryRolls: 1,
    });
  });
});

describe('revocationReason', () => {
  const qualifying = candidate('s', 0, { personalRecord: true });

  it('names why a drop no longer stands, in priority order', () => {
    expect(revocationReason('regular', qualifying, true, DEFAULT_LOOT, DEFAULT_LOOT.version)).toBe('session_deleted');
    expect(revocationReason('regular', undefined, false, DEFAULT_LOOT, DEFAULT_LOOT.version)).toBe('set_removed');
    expect(
      revocationReason('regular', { ...qualifying, effectiveReps: 0 }, false, DEFAULT_LOOT, DEFAULT_LOOT.version),
    ).toBe('no_longer_qualifies');
    expect(
      revocationReason('pr', { ...qualifying, personalRecord: false }, false, DEFAULT_LOOT, DEFAULT_LOOT.version),
    ).toBe('no_longer_qualifies');
    expect(revocationReason('pr', { ...qualifying, builtIn: false }, false, DEFAULT_LOOT, DEFAULT_LOOT.version)).toBe(
      'no_longer_qualifies',
    );
  });

  it('keeps drops rolled under an older loot version that would no longer qualify', () => {
    const olderVersion = DEFAULT_LOOT.version - 1;
    expect(
      revocationReason('regular', { ...qualifying, effectiveReps: 0 }, false, DEFAULT_LOOT, olderVersion),
    ).toBeNull();
    expect(
      revocationReason('pr', { ...qualifying, personalRecord: false }, false, DEFAULT_LOOT, olderVersion),
    ).toBeNull();
  });

  it('still revokes older drops whose set or session is gone', () => {
    const olderVersion = DEFAULT_LOOT.version - 1;
    expect(revocationReason('regular', undefined, false, DEFAULT_LOOT, olderVersion)).toBe('set_removed');
    expect(revocationReason('regular', qualifying, true, DEFAULT_LOOT, olderVersion)).toBe('session_deleted');
  });

  it('revokes a bout edited below the cardio threshold', () => {
    const shortBout = candidate('bout', 0, { kind: 'cardio', effectiveReps: 0, countedWorkS: 540 });
    expect(revocationReason('regular', shortBout, false, DEFAULT_LOOT, DEFAULT_LOOT.version)).toBe(
      'no_longer_qualifies',
    );
    expect(
      revocationReason('regular', { ...shortBout, countedWorkS: 600 }, false, DEFAULT_LOOT, DEFAULT_LOOT.version),
    ).toBeNull();
  });

  it('keeps drops whose set still qualifies', () => {
    expect(revocationReason('regular', qualifying, false, DEFAULT_LOOT, DEFAULT_LOOT.version)).toBeNull();
    expect(revocationReason('pr', qualifying, false, DEFAULT_LOOT, DEFAULT_LOOT.version)).toBeNull();
    expect(
      revocationReason('regular', { ...qualifying, personalRecord: false }, false, DEFAULT_LOOT, DEFAULT_LOOT.version),
    ).toBeNull();
  });
});
