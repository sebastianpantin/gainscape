export interface WeightedLevel {
  level: number;
  weight: number;
}

const LOWEST_COMBAT_LEVEL = 3;
const COMBAT_LEVEL_SPAN = 123;
const SKILL_LEVEL_SPAN = 98;

function roundHalfUp(value: number): number {
  return Math.floor(value + 0.5);
}

export function combatLevel(entries: readonly WeightedLevel[]): number {
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) return LOWEST_COMBAT_LEVEL;
  const weightedAverageLevel = entries.reduce((sum, entry) => sum + entry.weight * entry.level, 0) / totalWeight;
  return roundHalfUp(LOWEST_COMBAT_LEVEL + (COMBAT_LEVEL_SPAN * (weightedAverageLevel - 1)) / SKILL_LEVEL_SPAN);
}
