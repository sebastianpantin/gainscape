import { type LevelUp, type QuestSessionSummary, type SessionSummary } from './types.ts';

interface PositionedSet {
  id: string;
  position: number;
}

export function splitSetsByDay<Set extends PositionedSet>(
  sets: readonly Set[],
  secondDaySetIds: readonly string[],
): { first: Set[]; second: Set[] } {
  const inSecondDay = new Set(secondDaySetIds);
  const renumbered = (day: readonly Set[]) => day.map((set, position) => ({ ...set, position }));
  return {
    first: renumbered(sets.filter((set) => !inSecondDay.has(set.id))),
    second: renumbered(sets.filter((set) => inSecondDay.has(set.id))),
  };
}

function addedBySkill(
  first: Record<string, number> | undefined,
  second: Record<string, number> | undefined,
): Record<string, number> | undefined {
  if (first === undefined && second === undefined) return undefined;
  const sum: Record<string, number> = { ...first };
  for (const [skill, amount] of Object.entries(second ?? {})) sum[skill] = (sum[skill] ?? 0) + amount;
  return sum;
}

function joinedLevelUps(first: readonly LevelUp[], second: readonly LevelUp[]): LevelUp[] {
  const bySkill = new Map(first.map((levelUp) => [levelUp.skill, levelUp]));
  for (const levelUp of second) {
    const earlier = bySkill.get(levelUp.skill);
    bySkill.set(levelUp.skill, earlier ? { ...levelUp, from: earlier.from } : levelUp);
  }
  return [...bySkill.values()];
}

function mergedQuests(
  first: QuestSessionSummary | undefined,
  second: QuestSessionSummary | undefined,
): QuestSessionSummary | undefined {
  if (first === undefined || second === undefined) return first ?? second;
  const progressed = new Map(first.progressed.map((progress) => [progress.questId, progress]));
  for (const progress of second.progressed) progressed.set(progress.questId, progress);
  return {
    completed: [...first.completed, ...second.completed],
    progressed: [...progressed.values()],
    unlocked: [...new Set([...first.unlocked, ...second.unlocked])],
    levelUps: joinedLevelUps(first.levelUps, second.levelUps),
  };
}

export function mergedSummaries(first: SessionSummary, second: SessionSummary): SessionSummary {
  const gearBonusBySkill = addedBySkill(first.gearBonusBySkill, second.gearBonusBySkill);
  const challengeBonusBySkill = addedBySkill(first.challengeBonusBySkill, second.challengeBonusBySkill);
  const quests = mergedQuests(first.quests, second.quests);
  return {
    sessionId: first.sessionId,
    xpBySkill: addedBySkill(first.xpBySkill, second.xpBySkill) ?? {},
    levelUps: joinedLevelUps(first.levelUps, second.levelUps),
    prs: [...first.prs, ...second.prs],
    drops: [...first.drops, ...second.drops],
    ...(gearBonusBySkill ? { gearBonusBySkill } : {}),
    ...(first.challenge !== undefined ? { challenge: first.challenge } : {}),
    ...(challengeBonusBySkill ? { challengeBonusBySkill } : {}),
    ...(quests ? { quests } : {}),
    ...(first.historyOnly && second.historyOnly ? { historyOnly: true as const } : {}),
  };
}
