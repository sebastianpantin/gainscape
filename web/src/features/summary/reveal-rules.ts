import { levelProgress, MAX_LEVEL } from '@domain/index.ts';
import { FLOAT_TOLERANCE } from '@domain/math.ts';
import type { LevelUp, QuestProgressSummary, SessionSummary } from '@domain/types.ts';
import type { DraftChallenge } from '../../offline/draft-format.ts';
import { formatXp } from '../../lib/format.ts';
import type { LevelUpTier } from '../../lib/platform/celebration-effects.ts';
import type { UnitPref } from '../../lib/profile/profile-rules.ts';
import { formatWeight } from '../../lib/units.ts';
import {
  type QuestLog,
  questPointsText,
  type QuestSkill,
  questStepProgress,
  questStepText,
  rewardXpTexts,
} from '../../lib/quests/quest-rules.ts';

export function bonusText(
  label: 'Gear' | 'Challenge',
  bonusBySkill: Readonly<Record<string, number>> | undefined,
  skillKey: string,
): string | null {
  const bonus = bonusBySkill?.[skillKey] ?? 0;
  return bonus > 0 ? `${label} bonus +${formatXp(bonus)} XP` : null;
}

export function challengeHeadline(summary: Pick<SessionSummary, 'challenge'>): string | null {
  const challenge = summary.challenge;
  if (!challenge) return null;
  return `${challenge.passed ? 'Challenge complete' : 'Challenge failed'}: ${challenge.name}`;
}

export function challengeNotAppliedText(
  summary: Pick<SessionSummary, 'challenge' | 'historyOnly'>,
  planned: DraftChallenge | null,
): string | null {
  if (!planned || summary.challenge) return null;
  return summary.historyOnly
    ? 'Challenge not applied: a workout older than 7 days is saved to history only. Your scroll was kept.'
    : `Challenge not applied: ${planned.name} couldn't be applied to this workout, so it was saved as a normal workout.`;
}

function risenTarget(
  serverFloorsKg: Record<string, number | null>,
  plannedLoadsKg: Record<string, number | null>,
): { exerciseId: string; floorKg: number; plannedKg: number } | null {
  for (const [exerciseId, floorKg] of Object.entries(serverFloorsKg)) {
    const plannedKg = plannedLoadsKg[exerciseId] ?? null;
    if (floorKg !== null && plannedKg !== null && floorKg > plannedKg + FLOAT_TOLERANCE) {
      return { exerciseId, floorKg, plannedKg };
    }
  }
  return null;
}

export function challengeFailReason(
  summary: Pick<SessionSummary, 'challenge'>,
  planned: DraftChallenge | null,
  nameOf: (exerciseId: string) => string,
  unit: UnitPref,
): string | null {
  const challenge = summary.challenge;
  if (!challenge || challenge.passed) return null;
  if (!planned) return 'Challenge target not reached';
  const risen = risenTarget(challenge.targetLoadsKg, planned.targetLoadsKg);
  if (risen) {
    const { exerciseId, floorKg, plannedKg } = risen;
    return `Target rose since you started: ${nameOf(exerciseId)} ${formatWeight(floorKg, unit)} (planned ${formatWeight(plannedKg, unit)})`;
  }
  return planned.definition.kind === 'prescription'
    ? 'Not every prescribed set reached its reps and load'
    : 'Volume target not reached';
}

export function unappliedChangesText(
  summary: Pick<SessionSummary, 'historyOnly'> & { storedContentDiffers?: true },
): string | null {
  if (!summary.storedContentDiffers) return null;
  const notApplied =
    "This workout was already saved, and the saved version differs from this device's copy, so this copy was not applied.";
  return summary.historyOnly ? notApplied : `${notApplied} Check it in History.`;
}

export interface QuestRevealLine {
  questId: string;
  text: string;
  detail: string | null;
}

export interface QuestReveal {
  completed: QuestRevealLine[];
  progressed: QuestRevealLine[];
  unlocked: string[];
  levelUps: { skillName: string; from: number; to: number }[];
}

const UNKNOWN_QUEST = 'A quest';

function progressedLine(
  { questId, stepIndex, stepProgress, stepTarget }: QuestProgressSummary,
  log: QuestLog | null,
  unit: UnitPref,
): QuestRevealLine {
  const quest = log?.quests.find((candidate) => candidate.questId === questId);
  const step = quest?.steps[stepIndex];
  if (!quest || !step) {
    return {
      questId,
      text: `${UNKNOWN_QUEST}: step ${stepIndex + 1}`,
      detail: stepTarget > 1 ? `${formatXp(stepProgress)} / ${formatXp(stepTarget)}` : null,
    };
  }
  const nameOf = (exerciseId: string) => log?.exerciseNames[exerciseId] ?? 'Exercise';
  const progress = questStepProgress(step, stepProgress, unit);
  return {
    questId,
    text: `${quest.name}: step ${stepIndex + 1} of ${quest.steps.length}`,
    detail: progress?.text ?? questStepText(step, nameOf, unit),
  };
}

export function questRevealLines(
  summary: Pick<SessionSummary, 'quests'>,
  log: QuestLog | null,
  skills: readonly QuestSkill[],
  unit: UnitPref,
): QuestReveal | null {
  const quests = summary.quests;
  if (!quests) return null;
  const skillByKey = (skillKey: string) => skills.find((skill) => skill.key === skillKey)?.name ?? skillKey;
  const questName = (questId: string) => log?.quests.find((quest) => quest.questId === questId)?.name;
  const reveal: QuestReveal = {
    completed: quests.completed.map((completed) => ({
      questId: completed.questId,
      text: `Quest complete: ${completed.name}`,
      detail: [
        `+${questPointsText(completed.questPoints)}`,
        rewardXpTexts(completed.xpBySkill, skills)
          .map((text) => `+${text}`)
          .join(', '),
      ]
        .filter((part) => part !== '')
        .join(' · '),
    })),
    progressed: quests.progressed.map((progressed) => progressedLine(progressed, log, unit)),
    unlocked: quests.unlocked.map((questId) => `New quest available: ${questName(questId) ?? 'a new quest'}`),
    levelUps: quests.levelUps.map(({ skill, from, to }) => ({ skillName: skillByKey(skill), from, to })),
  };
  const hasNews =
    reveal.completed.length + reveal.progressed.length + reveal.unlocked.length + reveal.levelUps.length > 0;
  return hasNews ? reveal : null;
}

export const REVEAL_MAX_PRE_LOOT_S = 1.5;
const SKILLS_START_S = 0.1;
const SKILL_STAGGER_S = 0.15;
const SKILL_SPREAD_MAX_S = 0.45;
const BAR_LAG_S = 0.1;
const SKILL_SETTLE_S = 0.35;
const LEVEL_UP_BEAT_S = 0.3;
const RECORDS_BEAT_S = 0.25;
const RISE_S = 0.4;
const GAIN_FILL_S = 0.6;
const POP_PEAK_MS = 300;
const SUMMARY_READ_S = 0.6;

const TIER_RANK: Record<LevelUpTier, number> = { normal: 0, milestone: 1, max: 2 };

const TAKEOVER_S: Record<LevelUpTier, number> = { normal: 1.6, milestone: 2.2, max: 3 };

const NAMED_MILESTONES: readonly number[] = [10, 25, 50, 75];
const ROUND_MILESTONES_FROM = 50;
const ROUND_MILESTONE_STEP = 10;

function isMilestone(level: number): boolean {
  return NAMED_MILESTONES.includes(level) || (level > ROUND_MILESTONES_FROM && level % ROUND_MILESTONE_STEP === 0);
}

export function levelUpTier({ from, to }: Pick<LevelUp, 'from' | 'to'>): LevelUpTier {
  if (to >= MAX_LEVEL) return 'max';
  for (let level = from + 1; level <= to; level++) if (isMilestone(level)) return 'milestone';
  return 'normal';
}

export interface LevelUpEntry extends LevelUp {
  tier: LevelUpTier;
}

export interface LevelUpTakeover {
  tier: LevelUpTier;
  entries: LevelUpEntry[];
}

export function levelUpTakeover(levelUps: readonly LevelUp[]): LevelUpTakeover | null {
  const entries = levelUps
    .map((levelUp) => ({ ...levelUp, tier: levelUpTier(levelUp) }))
    .sort((left, right) => TIER_RANK[right.tier] - TIER_RANK[left.tier] || right.to - left.to);
  const [biggest] = entries;
  return biggest === undefined ? null : { tier: biggest.tier, entries };
}

const TAKEOVER_KICKERS: Record<LevelUpTier, string> = {
  normal: 'Level up!',
  milestone: 'Milestone!',
  max: 'Max level!',
};

export function takeoverKicker(tier: LevelUpTier, count: number): string {
  return count === 1 ? TAKEOVER_KICKERS[tier] : `${count} level ups!`;
}

interface RevealShape {
  skillCount: number;
  levelUp: { tier: LevelUpTier; count: number } | null;
  hasRecords: boolean;
}

export function playsReveal(summary: Pick<SessionSummary, 'historyOnly'> | null): boolean {
  return summary !== null && !summary.historyOnly;
}

export function skipsRevealOnKey({
  key,
  onInteractiveElement,
}: {
  key: string;
  onInteractiveElement: boolean;
}): boolean {
  if (key === 'Escape') return true;
  return key === 'Enter' && !onInteractiveElement;
}

export function revealShape(
  summary: Pick<SessionSummary, 'historyOnly' | 'xpBySkill' | 'levelUps' | 'prs'> | null,
): RevealShape {
  if (!summary || summary.historyOnly) return { skillCount: 0, levelUp: null, hasRecords: false };
  const takeover = levelUpTakeover(summary.levelUps);
  return {
    skillCount: Object.values(summary.xpBySkill).filter((xp) => xp > 0).length,
    levelUp: takeover && { tier: takeover.tier, count: takeover.entries.length },
    hasRecords: summary.prs.length > 0,
  };
}

export interface RevealTakeover {
  startS: number;
  endS: number;
}

export interface RevealTimeline {
  skillDelaysS: number[];
  barDelaysS: number[];
  takeover: RevealTakeover | null;
  levelUpDelayS: number | null;
  recordsDelayS: number | null;
  lootDelayS: number;
  settledAfterMs: number;
}

function toMs(seconds: number): number {
  return Math.round(seconds * 1000);
}

function roundedS(seconds: number): number {
  return toMs(seconds) / 1000;
}

function takeoverLengthS({ tier, count }: { tier: LevelUpTier; count: number }): number {
  return TAKEOVER_S[tier] + (count > 1 ? SUMMARY_READ_S : 0);
}

export function revealTimeline({ skillCount, levelUp, hasRecords }: RevealShape): RevealTimeline {
  const stagger = skillCount > 1 ? Math.min(SKILL_STAGGER_S, SKILL_SPREAD_MAX_S / (skillCount - 1)) : 0;
  const skillDelaysS = Array.from({ length: skillCount }, (_, index) => roundedS(SKILLS_START_S + index * stagger));
  const barDelaysS = skillDelaysS.map((delay) => roundedS(delay + BAR_LAG_S));
  const lastSkillS = skillDelaysS.at(-1);
  const lastBarEndS = Math.max(0, ...barDelaysS.map((delay) => delay + GAIN_FILL_S));
  let cursor = lastSkillS === undefined ? SKILLS_START_S : lastSkillS + SKILL_SETTLE_S;
  let takeover: RevealTakeover | null = null;
  if (levelUp) {
    const startS = Math.max(cursor, lastBarEndS);
    takeover = { startS: roundedS(startS), endS: roundedS(startS + takeoverLengthS(levelUp)) };
    cursor = takeover.endS;
  }
  const levelUpDelayS = levelUp ? roundedS(cursor) : null;
  if (levelUp) cursor += LEVEL_UP_BEAT_S;
  const recordsDelayS = hasRecords ? roundedS(cursor) : null;
  if (hasRecords) cursor += RECORDS_BEAT_S;
  const lootDelayS = roundedS(cursor);
  return {
    skillDelaysS,
    barDelaysS,
    takeover,
    levelUpDelayS,
    recordsDelayS,
    lootDelayS,
    settledAfterMs: toMs(Math.max(lootDelayS + RISE_S, lastBarEndS)),
  };
}

export function levelUpCueDelayMs(timeline: Pick<RevealTimeline, 'takeover'>, reducedMotion: boolean): number | null {
  if (timeline.takeover === null) return null;
  return reducedMotion ? 0 : toMs(timeline.takeover.startS) + POP_PEAK_MS;
}

function xpToGoText(nextLevelXp: number, xp: number): string {
  return formatXp(Math.ceil(nextLevelXp - xp));
}

export function xpToNextLevelText(xp: number): string {
  const { level, nextLevelXp } = levelProgress(xp);
  if (nextLevelXp === null) return 'Max level';
  return `${xpToGoText(nextLevelXp, xp)} XP to level ${level + 1}`;
}

export function gainBarLabel(skillName: string, xp: number): string {
  const { level, nextLevelXp, fractionToNextLevel } = levelProgress(xp);
  if (nextLevelXp === null) return `${skillName}: Max level`;
  return `${skillName}: ${Math.round(fractionToNextLevel * 100)}% of the way to level ${level + 1}, ${xpToGoText(nextLevelXp, xp)} XP to go`;
}
