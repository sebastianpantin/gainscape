import { levelForXp } from '@domain/levels.ts';
import {
  type QuestDefinition,
  questDefinitionFromStored,
  type QuestProgress,
  type QuestStatus,
  questStatus,
  type QuestStep,
} from '@domain/quests.ts';
import { kgToUnit, type WeightUnit } from '@domain/units.ts';
import { challengeSummaryText } from '../collection/challenge-rules.ts';
import { formatCount, formatXp } from '../format.ts';
import { z } from 'zod';
import { numericColumn } from '../rows.ts';
import type { InvokeOutcome } from '../platform/function-client-rules.ts';
import { RATE_LIMITED_CODE, retryAfterSeconds, tryAgainIn } from '../platform/rate-limit.ts';

export const QUEST_COLUMNS = 'id,key,name,description,quest_points,sort_order,definition,retired_at';
export const QUEST_PROGRESS_COLUMNS = 'quest_id,started_at,step_index,step_progress';
export const QUEST_COMPLETION_COLUMNS = 'quest_id,completed_at,quest_points';

export const questRowSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  description: z.string(),
  quest_points: z.number(),
  sort_order: z.number(),
  definition: z.unknown(),
  retired_at: z.string().nullable(),
});

type QuestRow = z.infer<typeof questRowSchema>;

export const questProgressRowSchema = z.object({
  quest_id: z.string(),
  started_at: z.string(),
  step_index: z.number(),
  step_progress: numericColumn,
});

export const questCompletionRowSchema = z.object({
  quest_id: z.string(),
  completed_at: z.string(),
  quest_points: z.number(),
});

export const questRowsSchema = z.object({
  quests: z.array(questRowSchema),
  progress: z.array(questProgressRowSchema),
  completions: z.array(questCompletionRowSchema),
  exerciseNames: z.record(z.string(), z.string()),
});

export type QuestRows = z.infer<typeof questRowsSchema>;

export interface CatalogQuest extends QuestDefinition {
  description: string;
  sortOrder: number;
  retired: boolean;
}

export interface QuestLog {
  quests: CatalogQuest[];
  progress: QuestProgress[];
  completedQuestIds: string[];
  questPoints: number;
  exerciseNames: Record<string, string>;
}

export interface QuestSkill {
  id: string;
  key: string;
  name: string;
}

export interface RequirementLine {
  text: string;
  met: boolean;
}

export type StepState = 'done' | 'current' | 'upcoming';

interface StepProgress {
  text: string;
  fraction: number;
}

export interface StepLine {
  text: string;
  state: StepState;
  progress: StepProgress | null;
}

export interface QuestCard {
  quest: CatalogQuest;
  status: QuestStatus;
  requirements: RequirementLine[];
  steps: StepLine[];
  rewards: string[];
  unlocks: string[];
}

interface QuestGroup {
  status: QuestStatus;
  title: string;
  folded: boolean;
  cards: QuestCard[];
}

const FOLDED_STATUSES: ReadonlySet<QuestStatus> = new Set(['locked', 'completed']);

const GROUP_TITLES: readonly (readonly [QuestStatus, string])[] = [
  ['in_progress', 'In progress'],
  ['available', 'Available'],
  ['locked', 'Locked'],
  ['completed', 'Completed'],
];

const ANY_LIFT = 'any lift';
const UNKNOWN_EXERCISE = 'Exercise';

export function toCatalogQuest(row: QuestRow): CatalogQuest | null {
  try {
    const definition = questDefinitionFromStored(
      { questId: row.id, key: row.key, name: row.name, questPoints: row.quest_points },
      row.definition,
    );
    return { ...definition, description: row.description, sortOrder: row.sort_order, retired: row.retired_at !== null };
  } catch {
    return null;
  }
}

export function questLogFrom(rows: QuestRows): QuestLog {
  return {
    quests: rows.quests
      .flatMap((row) => toCatalogQuest(row) ?? [])
      .sort((first, second) => first.sortOrder - second.sortOrder),
    progress: rows.progress.map((row) => ({
      questId: row.quest_id,
      startedAt: row.started_at,
      stepIndex: row.step_index,
      stepProgress: Number(row.step_progress),
    })),
    completedQuestIds: rows.completions.map((row) => row.quest_id),
    questPoints: rows.completions.reduce((sum, row) => sum + row.quest_points, 0),
    exerciseNames: rows.exerciseNames,
  };
}

function stepExerciseIds(step: QuestStep): string[] {
  if (step.kind !== 'workout') return step.exerciseId === null ? [] : [step.exerciseId];
  if (step.challenge.kind === 'volume') return step.challenge.exerciseId === null ? [] : [step.challenge.exerciseId];
  return step.challenge.groups.flatMap((group) => group.exercises.map((exercise) => exercise.exerciseId));
}

export function questExerciseIds(quests: readonly QuestDefinition[]): string[] {
  return [...new Set(quests.flatMap((quest) => quest.steps.flatMap(stepExerciseIds)))];
}

export function questPointsText(points: number): string {
  return formatCount(points, 'quest point');
}

function shownWeight(kg: number, unit: WeightUnit): number {
  return Math.round(kgToUnit(kg, unit));
}

export function questStepText(step: QuestStep, nameOf: (exerciseId: string) => string, unit: WeightUnit): string {
  const exercise = (exerciseId: string | null) => (exerciseId === null ? null : nameOf(exerciseId));
  switch (step.kind) {
    case 'workout':
      return `In one workout: ${challengeSummaryText(step.challenge, nameOf, unit)}`;
    case 'volume': {
      const name = exercise(step.exerciseId);
      if (step.metric === 'reps') return `${formatXp(step.target)} reps of ${name ?? ANY_LIFT} in total`;
      const weight = `${formatXp(shownWeight(step.target, unit))} ${unit}`;
      return name === null ? `Lift ${weight} in total` : `Lift ${weight} of ${name} in total`;
    }
    case 'record': {
      const name = exercise(step.exerciseId);
      return name === null ? 'Set a new record' : `Set a new ${name} record`;
    }
    case 'sessions': {
      const name = exercise(step.exerciseId);
      const workouts = formatCount(step.target, 'workout');
      return name === null ? `Finish ${workouts}` : `Train ${name} in ${workouts}`;
    }
  }
}

export function questStepProgress(step: QuestStep, progress: number, unit: WeightUnit): StepProgress | null {
  if (step.kind === 'workout' || step.kind === 'record') return null;
  const fraction = Math.min(1, Math.max(0, progress / step.target));
  if (step.kind === 'sessions')
    return { text: `${formatXp(progress)} / ${formatCount(step.target, 'workout')}`, fraction };
  if (step.metric === 'reps') {
    return { text: `${formatXp(Math.floor(progress))} / ${formatXp(step.target)} reps`, fraction };
  }
  const done = formatXp(Math.floor(kgToUnit(progress, unit)));
  return { text: `${done} / ${formatXp(shownWeight(step.target, unit))} ${unit}`, fraction };
}

interface ActiveQuestLine {
  questName: string;
  stepText: string;
  progressText: string;
  fraction: number;
}

export function activeQuestLine(log: QuestLog, unit: WeightUnit): ActiveQuestLine | null {
  for (const quest of log.quests) {
    const progress = log.progress.find((entry) => entry.questId === quest.questId);
    const step = progress && quest.steps[progress.stepIndex];
    if (!progress || !step || log.completedQuestIds.includes(quest.questId)) continue;
    const stepCount = quest.steps.length;
    const counter = questStepProgress(step, progress.stepProgress, unit);
    const nameOf = (exerciseId: string) => log.exerciseNames[exerciseId] ?? UNKNOWN_EXERCISE;
    return {
      questName: quest.name,
      stepText: `Step ${progress.stepIndex + 1} of ${stepCount}: ${questStepText(step, nameOf, unit)}`,
      progressText: counter?.text ?? `${progress.stepIndex} of ${stepCount} steps done`,
      fraction: (progress.stepIndex + (counter?.fraction ?? 0)) / stepCount,
    };
  }
  return null;
}

function stepState(index: number, status: QuestStatus, progress: QuestProgress | undefined): StepState {
  if (status === 'completed') return 'done';
  if (progress === undefined) return 'upcoming';
  if (index < progress.stepIndex) return 'done';
  return index === progress.stepIndex ? 'current' : 'upcoming';
}

function stepLines(
  quest: CatalogQuest,
  status: QuestStatus,
  progress: QuestProgress | undefined,
  nameOf: (exerciseId: string) => string,
  unit: WeightUnit,
): StepLine[] {
  return quest.steps.map((step, index) => {
    const state = stepState(index, status, progress);
    return {
      text: questStepText(step, nameOf, unit),
      state,
      progress: state === 'current' && progress ? questStepProgress(step, progress.stepProgress, unit) : null,
    };
  });
}

function requirementLines(
  quest: CatalogQuest,
  skillXp: Readonly<Record<string, number>>,
  completedQuestIds: readonly string[],
  skillName: (skillId: string) => string,
  questName: (questId: string) => string,
): RequirementLine[] {
  const levels = quest.requiredLevels.map(({ skillId, level }) => {
    const current = levelForXp(skillXp[skillId] ?? 0);
    return { text: `${skillName(skillId)} level ${level} (now ${current})`, met: current >= level };
  });
  const quests = quest.requiredQuestIds.map((questId) => ({
    text: `Complete ${questName(questId)}`,
    met: completedQuestIds.includes(questId),
  }));
  return [...levels, ...quests];
}

export function rewardXpTexts(xpBySkill: Readonly<Record<string, number>>, skills: readonly QuestSkill[]): string[] {
  return skills.flatMap((skill) => {
    const xp = xpBySkill[skill.id] ?? 0;
    return xp > 0 ? [`${formatXp(xp)} ${skill.name} XP`] : [];
  });
}

function rewardLines(quest: CatalogQuest, skills: readonly QuestSkill[]): string[] {
  return [questPointsText(quest.questPoints), ...rewardXpTexts(quest.rewardXp, skills)];
}

function isShown(quest: CatalogQuest, status: QuestStatus): boolean {
  return !quest.retired || status === 'in_progress' || status === 'completed';
}

export function questBoard(
  log: QuestLog,
  skills: readonly QuestSkill[],
  skillXp: Readonly<Record<string, number>>,
  unit: WeightUnit,
): QuestGroup[] {
  const standing = {
    skillXp,
    completedQuestIds: log.completedQuestIds,
    startedQuestIds: log.progress.map((progress) => progress.questId),
  };
  const skillName = (skillId: string) => skills.find((skill) => skill.id === skillId)?.name ?? 'a skill';
  const questName = (questId: string) => log.quests.find((quest) => quest.questId === questId)?.name ?? 'a quest';
  const exerciseName = (exerciseId: string) => log.exerciseNames[exerciseId] ?? UNKNOWN_EXERCISE;
  const cards = log.quests.flatMap((quest): QuestCard[] => {
    const status = questStatus(quest, standing);
    if (!isShown(quest, status)) return [];
    const progress = log.progress.find((entry) => entry.questId === quest.questId);
    return [
      {
        quest,
        status,
        requirements: requirementLines(quest, skillXp, log.completedQuestIds, skillName, questName),
        steps: stepLines(quest, status, progress, exerciseName, unit),
        rewards: rewardLines(quest, skills),
        unlocks: log.quests
          .filter((other) => !other.retired && other.requiredQuestIds.includes(quest.questId))
          .map((other) => other.name),
      },
    ];
  });
  return GROUP_TITLES.flatMap(([status, title]) => {
    const grouped = cards.filter((card) => card.status === status);
    return grouped.length === 0 ? [] : [{ status, title, folded: FOLDED_STATUSES.has(status), cards: grouped }];
  });
}

export function canStartQuest(status: QuestStatus, offline: boolean): boolean {
  return status === 'available' && !offline;
}

interface QuestProblemNames {
  skillName: (skillId: string) => string;
  questName: (questId: string) => string;
}

function missingRequirementText(problem: unknown, names: QuestProblemNames): string[] {
  if (typeof problem !== 'object' || problem === null) return [];
  const { kind, skillId, level, questId } = problem as Record<string, unknown>;
  if (kind === 'missing_level' && typeof skillId === 'string' && typeof level === 'number') {
    return [`${names.skillName(skillId)} level ${level}`];
  }
  if (kind === 'missing_quest' && typeof questId === 'string') return [`complete ${names.questName(questId)}`];
  return [];
}

function requirementsProblemText(details: unknown, names: QuestProblemNames): string {
  const missing = (details as { missing?: unknown } | null | undefined)?.missing;
  const lines = Array.isArray(missing) ? missing.flatMap((problem) => missingRequirementText(problem, names)) : [];
  const prefix = "You don't meet this quest's requirements yet";
  return lines.length === 0 ? `${prefix}.` : `${prefix}: ${lines.join(', ')}.`;
}

export function startQuestProblemText(
  outcome: Exclude<InvokeOutcome<unknown>, { kind: 'ok' }>,
  names: QuestProblemNames,
): string {
  switch (outcome.kind) {
    case 'needs_sign_in':
      return 'Your sign-in expired. Sign in again to start this quest.';
    case 'wrong_account':
      return 'You are signed in as someone else in another tab. Reload the app.';
    case 'retryable':
      return "Couldn't reach the server. Check your connection and try again.";
    case 'http_error':
      switch (outcome.code) {
        case 'quest_not_found':
          return 'This quest is no longer available.';
        case 'quest_completed':
          return 'You have already completed this quest.';
        case 'quest_requirements_not_met':
          return requirementsProblemText(outcome.details, names);
        case RATE_LIMITED_CODE:
          return `Too many quests started. ${tryAgainIn(retryAfterSeconds(outcome.details))}`;
        default:
          return "Couldn't start the quest. Try again.";
      }
  }
}
