import type { BalanceConfig } from './balance.ts';
import {
  type ChallengeDefinition,
  challengeDefinitionFromStored,
  challengeE1rmSnapshot,
  judgeChallenge,
  liftVolume,
  type VolumeMetric,
} from './challenges.ts';
import { levelForXp } from './levels.ts';
import { FLOAT_TOLERANCE, roundTo } from './math.ts';
import { levelUpsBetween } from './pipeline.ts';
import { applyXpGrant } from './replay.ts';
import {
  type Catalog,
  isLiftSet,
  isRecord,
  type LevelUp,
  type PersonalRecordSummary,
  type QuestIdentity,
  type QuestProgressSummary,
  type QuestSessionSummary,
  type SetResult,
  type StrengthState,
} from './types.ts';

export type QuestStep =
  | { kind: 'workout'; challenge: ChallengeDefinition }
  | { kind: 'volume'; metric: VolumeMetric; target: number; exerciseId: string | null }
  | { kind: 'record'; exerciseId: string | null }
  | { kind: 'sessions'; target: number; exerciseId: string | null };

export interface QuestRequiredLevel {
  skillId: string;
  level: number;
}

export interface QuestDefinition extends QuestIdentity {
  requiredLevels: QuestRequiredLevel[];
  requiredQuestIds: string[];
  steps: QuestStep[];
  rewardXp: Record<string, number>;
}

export interface QuestProgress {
  questId: string;
  startedAt: string;
  stepIndex: number;
  stepProgress: number;
}

export interface QuestStanding {
  skillXp: Readonly<Record<string, number>>;
  completedQuestIds: readonly string[];
  startedQuestIds: readonly string[];
}

export interface QuestSessionFacts {
  endedAt: string;
  sets: readonly SetResult[];
  strengthAtStart: StrengthState;
  prs: readonly PersonalRecordSummary[];
}

type QuestStartProblem =
  | { kind: 'already_completed' }
  | { kind: 'already_started' }
  | { kind: 'missing_level'; skillId: string; level: number; currentLevel: number }
  | { kind: 'missing_quest'; questId: string };

export type QuestStatus = 'locked' | 'available' | 'in_progress' | 'completed';

type QuestAdvance =
  { outcome: 'unchanged' } | { outcome: 'progressed'; progress: QuestProgress } | { outcome: 'completed' };

const VOLUME_DECIMALS = 2;

function missingRequirements(quest: QuestDefinition, standing: QuestStanding): QuestStartProblem[] {
  const missingLevels = quest.requiredLevels.flatMap(({ skillId, level }): QuestStartProblem[] => {
    const currentLevel = levelForXp(standing.skillXp[skillId] ?? 0);
    return currentLevel >= level ? [] : [{ kind: 'missing_level', skillId, level, currentLevel }];
  });
  const missingQuests = quest.requiredQuestIds
    .filter((questId) => !standing.completedQuestIds.includes(questId))
    .map((questId): QuestStartProblem => ({ kind: 'missing_quest', questId }));
  return [...missingLevels, ...missingQuests];
}

export function questStartProblems(quest: QuestDefinition, standing: QuestStanding): QuestStartProblem[] {
  if (standing.completedQuestIds.includes(quest.questId)) return [{ kind: 'already_completed' }];
  if (standing.startedQuestIds.includes(quest.questId)) return [{ kind: 'already_started' }];
  return missingRequirements(quest, standing);
}

export function questStatus(quest: QuestDefinition, standing: QuestStanding): QuestStatus {
  if (standing.completedQuestIds.includes(quest.questId)) return 'completed';
  if (standing.startedQuestIds.includes(quest.questId)) return 'in_progress';
  return missingRequirements(quest, standing).length === 0 ? 'available' : 'locked';
}

export function questsUnlockedBy(
  quests: readonly QuestDefinition[],
  before: QuestStanding,
  after: QuestStanding,
): string[] {
  return quests
    .filter((quest) => questStatus(quest, before) === 'locked' && questStatus(quest, after) === 'available')
    .map((quest) => quest.questId);
}

export function stepTarget(step: QuestStep): number {
  return step.kind === 'workout' || step.kind === 'record' ? 1 : step.target;
}

export function sessionCountsForQuest(progress: QuestProgress, endedAt: string): boolean {
  return Date.parse(endedAt) > Date.parse(progress.startedAt);
}

function isWorkingSet(result: SetResult): boolean {
  return !isLiftSet(result.set) || !result.set.isWarmup;
}

function matchesExercise(exerciseId: string | null, candidate: string): boolean {
  return exerciseId === null || exerciseId === candidate;
}

export function stepGain(step: QuestStep, facts: QuestSessionFacts): number {
  switch (step.kind) {
    case 'workout': {
      const snapshot = challengeE1rmSnapshot(step.challenge, facts.strengthAtStart);
      return judgeChallenge(step.challenge, facts.sets, snapshot).passed ? 1 : 0;
    }
    case 'volume':
      return roundTo(VOLUME_DECIMALS, liftVolume(facts.sets, step.metric, step.exerciseId, null, {}));
    case 'record':
      return facts.prs.some((pr) => matchesExercise(step.exerciseId, pr.exerciseId)) ? 1 : 0;
    case 'sessions':
      return facts.sets.some(
        (result) => isWorkingSet(result) && matchesExercise(step.exerciseId, result.set.exerciseId),
      )
        ? 1
        : 0;
  }
}

export function advanceQuest(quest: QuestDefinition, progress: QuestProgress, facts: QuestSessionFacts): QuestAdvance {
  if (!sessionCountsForQuest(progress, facts.endedAt)) return { outcome: 'unchanged' };
  const step = quest.steps[progress.stepIndex];
  if (step === undefined) return { outcome: 'completed' };
  const gain = stepGain(step, facts);
  if (gain <= 0) return { outcome: 'unchanged' };
  const reached = roundTo(VOLUME_DECIMALS, progress.stepProgress + gain);
  if (reached + FLOAT_TOLERANCE < stepTarget(step)) {
    return { outcome: 'progressed', progress: { ...progress, stepProgress: reached } };
  }
  const nextIndex = progress.stepIndex + 1;
  if (nextIndex >= quest.steps.length) return { outcome: 'completed' };
  return { outcome: 'progressed', progress: { ...progress, stepIndex: nextIndex, stepProgress: 0 } };
}

interface QuestSessionInput {
  quests: readonly QuestDefinition[];
  retiredQuestIds: readonly string[];
  progress: readonly QuestProgress[];
  completedQuestIds: readonly string[];
  skillXpBeforeSync: Readonly<Record<string, number>>;
  skillXpAfterSync: Readonly<Record<string, number>>;
  facts: QuestSessionFacts;
}

export interface QuestCompletion {
  quest: QuestDefinition;
  startedAt: string;
  xpBySkill: Record<string, number>;
  levelUps: LevelUp[];
}

interface QuestSessionOutcome {
  progressed: QuestProgress[];
  completions: QuestCompletion[];
  skillXp: Record<string, number>;
  summary: QuestSessionSummary | null;
}

function grantedXp(quest: QuestDefinition): Record<string, number> {
  return Object.fromEntries(Object.entries(quest.rewardXp).filter(([, xp]) => xp > 0));
}

function progressSummary(quest: QuestDefinition, progress: QuestProgress): QuestProgressSummary {
  return {
    questId: quest.questId,
    stepIndex: progress.stepIndex,
    stepProgress: progress.stepProgress,
    stepTarget: stepTarget(quest.steps[progress.stepIndex]),
  };
}

export function questsAfterSession(
  input: QuestSessionInput,
  catalog: Catalog,
  cfg: Pick<BalanceConfig, 'maxXp'>,
): QuestSessionOutcome {
  const questsById = new Map(input.quests.map((quest) => [quest.questId, quest]));
  const progressed: { quest: QuestDefinition; progress: QuestProgress }[] = [];
  const completions: QuestCompletion[] = [];
  let skillXp: Record<string, number> = { ...input.skillXpAfterSync };

  for (const progress of input.progress) {
    const quest = questsById.get(progress.questId);
    if (quest === undefined) continue;
    const advance = advanceQuest(quest, progress, input.facts);
    if (advance.outcome === 'progressed') progressed.push({ quest, progress: advance.progress });
    if (advance.outcome !== 'completed') continue;
    const xpBySkill = grantedXp(quest);
    const granted = applyXpGrant(skillXp, xpBySkill, cfg);
    completions.push({
      quest,
      startedAt: progress.startedAt,
      xpBySkill,
      levelUps: levelUpsBetween(skillXp, granted, catalog),
    });
    skillXp = granted;
  }

  const completedIds = completions.map((completion) => completion.quest.questId);
  const startedIds = input.progress.map((progress) => progress.questId);
  const openQuests = input.quests.filter((quest) => !input.retiredQuestIds.includes(quest.questId));
  const unlocked = questsUnlockedBy(
    openQuests,
    { skillXp: input.skillXpBeforeSync, completedQuestIds: input.completedQuestIds, startedQuestIds: startedIds },
    {
      skillXp,
      completedQuestIds: [...input.completedQuestIds, ...completedIds],
      startedQuestIds: startedIds.filter((questId) => !completedIds.includes(questId)),
    },
  );
  const summary: QuestSessionSummary | null =
    progressed.length === 0 && completions.length === 0 && unlocked.length === 0
      ? null
      : {
          completed: completions.map(({ quest, xpBySkill }) => ({
            questId: quest.questId,
            key: quest.key,
            name: quest.name,
            questPoints: quest.questPoints,
            xpBySkill,
          })),
          progressed: progressed.map(({ quest, progress }) => progressSummary(quest, progress)),
          unlocked,
          levelUps: levelUpsBetween(input.skillXpAfterSync, skillXp, catalog),
        };
  return { progressed: progressed.map(({ progress }) => progress), completions, skillXp, summary };
}

function storedRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) throw new RangeError(`a stored quest needs an object ${field}`);
  return value;
}

function storedArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new RangeError(`a stored quest needs an array ${field}`);
  return value;
}

function storedString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new RangeError(`a stored quest needs a string ${field}`);
  return value;
}

function storedNullableString(value: unknown, field: string): string | null {
  return value === null || value === undefined ? null : storedString(value, field);
}

function storedPositiveNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new RangeError(`a stored quest needs a positive number ${field}`);
  }
  return value;
}

function storedWholeNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new RangeError(`a stored quest needs a non-negative integer ${field}`);
  }
  return value;
}

function storedLevel(value: unknown): QuestRequiredLevel {
  const level = storedRecord(value, 'required level');
  return { skillId: storedString(level.skillId, 'skillId'), level: storedWholeNumber(level.level, 'level') };
}

function storedVolumeMetric(value: unknown): VolumeMetric {
  if (value !== 'reps' && value !== 'kg') {
    throw new RangeError(`unknown volume metric ${JSON.stringify(value)} in a stored quest`);
  }
  return value;
}

function storedStep(value: unknown): QuestStep {
  const step = storedRecord(value, 'step');
  switch (step.kind) {
    case 'workout':
      return { kind: 'workout', challenge: challengeDefinitionFromStored(step.challenge) };
    case 'volume':
      return {
        kind: 'volume',
        metric: storedVolumeMetric(step.metric),
        target: storedPositiveNumber(step.target, 'target'),
        exerciseId: storedNullableString(step.exerciseId, 'exerciseId'),
      };
    case 'record':
      return { kind: 'record', exerciseId: storedNullableString(step.exerciseId, 'exerciseId') };
    case 'sessions':
      return {
        kind: 'sessions',
        target: storedPositiveNumber(step.target, 'target'),
        exerciseId: storedNullableString(step.exerciseId, 'exerciseId'),
      };
    default:
      throw new RangeError(`unknown quest step kind ${JSON.stringify(step.kind)} in a stored quest`);
  }
}

export function questDefinitionFromStored(identity: QuestIdentity, value: unknown): QuestDefinition {
  const definition = storedRecord(value, 'definition');
  const steps = storedArray(definition.steps, 'steps').map(storedStep);
  if (steps.length === 0) throw new RangeError('a stored quest needs at least one step');
  return {
    ...identity,
    requiredLevels: storedArray(definition.requiredLevels, 'requiredLevels').map(storedLevel),
    requiredQuestIds: storedArray(definition.requiredQuestIds, 'requiredQuestIds').map((questId) =>
      storedString(questId, 'required quest id'),
    ),
    steps,
    rewardXp: Object.fromEntries(
      Object.entries(storedRecord(definition.rewardXp, 'rewardXp')).map(([skillId, xp]) => [
        skillId,
        storedWholeNumber(xp, 'reward xp'),
      ]),
    ),
  };
}
