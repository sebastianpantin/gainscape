export const MAX_LEVEL = 99;
const LEVELS_PER_XP_DOUBLING = 10;

function buildXpRequiredPerLevel(): readonly number[] {
  const xpRequired = new Array<number>(MAX_LEVEL + 1).fill(0);
  let accumulatedPoints = 0;
  for (let level = 2; level <= MAX_LEVEL; level++) {
    const previousLevel = level - 1;
    accumulatedPoints += Math.floor(previousLevel + 300 * Math.pow(2, previousLevel / LEVELS_PER_XP_DOUBLING));
    xpRequired[level] = Math.floor(accumulatedPoints / 4);
  }
  return xpRequired;
}

const XP_REQUIRED_PER_LEVEL = buildXpRequiredPerLevel();

export function xpForLevel(level: number): number {
  if (!Number.isInteger(level) || level < 1 || level > MAX_LEVEL) {
    throw new RangeError(`level out of range: ${level}`);
  }
  return XP_REQUIRED_PER_LEVEL[level];
}

export function levelForXp(xp: number): number {
  let lowestPossible = 1;
  let highestPossible = MAX_LEVEL;
  while (lowestPossible < highestPossible) {
    const candidate = Math.ceil((lowestPossible + highestPossible) / 2);
    if (XP_REQUIRED_PER_LEVEL[candidate] <= xp) lowestPossible = candidate;
    else highestPossible = candidate - 1;
  }
  return lowestPossible;
}

export interface LevelProgress {
  level: number;
  xp: number;
  levelStartXp: number;
  nextLevelXp: number | null;
  fractionToNextLevel: number;
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelForXp(xp);
  const levelStartXp = xpForLevel(level);
  if (level === MAX_LEVEL) {
    return { level, xp, levelStartXp, nextLevelXp: null, fractionToNextLevel: 1 };
  }
  const nextLevelXp = xpForLevel(level + 1);
  const fractionToNextLevel = (xp - levelStartXp) / (nextLevelXp - levelStartXp);
  return { level, xp, levelStartXp, nextLevelXp, fractionToNextLevel };
}

export function totalLevel(levels: readonly number[]): number {
  return levels.reduce((sum, level) => sum + level, 0);
}
