import { beforeAll, describe, expect, it } from 'vitest';
import {
  BANDS,
  evaluateQuestBudget,
  type ProfileResults,
  QUEST_BANDS,
  weekOneLevelWithQuestXp,
} from '../../scripts/balance/bands.ts';
import { LEVEL_99_XP } from '../../scripts/balance/progress.ts';
import { simulateCommittedConstantsUntilLegsReach99 } from '../../scripts/balance/tune.ts';
import { loadCatalogData } from '../../scripts/catalog/load.ts';

const SIMULATION_TIMEOUT_MS = 120_000;

const { quests } = loadCatalogData();
const report = evaluateQuestBudget(quests);

let results: ProfileResults;

beforeAll(() => {
  results = simulateCommittedConstantsUntilLegsReach99();
}, SIMULATION_TIMEOUT_MS);

describe('quest xp budget of the catalog', () => {
  it('(q1) keeps the quest xp of every skill within 1% of level 99', () => {
    for (const xp of Object.values(report.catalogXpBySkill)) {
      expect(xp).toBeLessThanOrEqual(QUEST_BANDS.maxCatalogShareOfLevel99 * LEVEL_99_XP);
    }
    expect(report.passes.catalogTotal).toBe(true);
  });

  it('(q2) grants at most 1000 xp per skill for a quest without requirements', () => {
    expect(report.oversizedStarterRewards).toEqual([]);
    expect(report.passes.starterRewards).toBe(true);
  });

  it('(q3) keeps the first week of a balanced lifter between legs level 20 and 40 with every starter quest done', () => {
    const [lowest, highest] = BANDS.balancedWeekOneLevel;
    const level = weekOneLevelWithQuestXp(results.balanced, 'legs', report.starterXpBySkill);
    expect(report.starterXpBySkill.legs).toBeGreaterThan(0);
    expect(level).toBeGreaterThanOrEqual(lowest);
    expect(level).toBeLessThanOrEqual(highest);
  });
});

describe('evaluateQuestBudget', () => {
  it('sums every quest per skill and the starter quests apart', () => {
    const budget = evaluateQuestBudget([
      { key: 'starter', requiredLevels: [], requiredQuests: [], rewardXp: [{ skill: 'legs', xp: 300 }] },
      {
        key: 'gated',
        requiredLevels: [{ skill: 'legs', level: 10 }],
        requiredQuests: [],
        rewardXp: [
          { skill: 'legs', xp: 700 },
          { skill: 'back', xp: 200 },
        ],
      },
      { key: 'chained', requiredLevels: [], requiredQuests: ['starter'], rewardXp: [{ skill: 'back', xp: 100 }] },
    ]);
    expect(budget.catalogXpBySkill).toEqual({ legs: 1000, back: 300 });
    expect(budget.starterXpBySkill).toEqual({ legs: 300 });
  });

  it('flags a skill whose quest xp passes 1% of level 99', () => {
    const greedy = structuredClone(quests);
    greedy.push({
      ...greedy[0],
      key: 'greedy',
      requiredLevels: [{ skill: 'legs', level: 50 }],
      rewardXp: [{ skill: 'legs', xp: Math.ceil(QUEST_BANDS.maxCatalogShareOfLevel99 * LEVEL_99_XP) }],
    });
    const budget = evaluateQuestBudget(greedy);
    expect(budget.oversizedSkills).toEqual(['legs']);
    expect(budget.passes.catalogTotal).toBe(false);
  });

  it('flags a quest without requirements that grants more than 1000 xp to a skill', () => {
    const generous = structuredClone(quests);
    const starter = generous.find((quest) => quest.requiredLevels.length === 0 && quest.requiredQuests.length === 0)!;
    starter.rewardXp = [...starter.rewardXp, { skill: 'grip', xp: QUEST_BANDS.maxStarterXpPerSkill + 1 }];
    const budget = evaluateQuestBudget(generous);
    expect(budget.oversizedStarterRewards).toEqual([`${starter.key}.grip`]);
    expect(budget.passes.starterRewards).toBe(false);
  });
});
