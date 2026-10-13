import { GLOSSARY, type GlossaryEntry } from '../ui/glossary.ts';
import { type TemplateListEntry } from '../programs/program-enroll-rules.ts';

export type OnboardingRecord = { status: 'done' } | { status: 'absent' } | { status: 'unavailable' };

export type TrainingHistory = 'unknown' | 'none' | 'some';

export type OnboardingDecision = 'show' | 'hide' | 'wait' | 'record';

export const ONBOARDING_STEPS = ['welcome', 'units', 'train'] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const BEGINNER_TEMPLATE = 'stronglifts_5x5';

export function onboardingDecision(record: OnboardingRecord, history: TrainingHistory): OnboardingDecision {
  if (record.status !== 'absent') return 'hide';
  if (history === 'unknown') return 'wait';
  return history === 'some' ? 'record' : 'show';
}

export function trainingHistoryOf({
  hasWorkout,
  hasEnrollment,
}: {
  hasWorkout: boolean;
  hasEnrollment: boolean;
}): TrainingHistory {
  return hasWorkout || hasEnrollment ? 'some' : 'none';
}

export function trainingHistoryNow({
  hasDraft,
  fetching,
  fetched,
}: {
  hasDraft: boolean;
  fetching: boolean;
  fetched: TrainingHistory | null;
}): TrainingHistory {
  if (hasDraft) return 'some';
  if (fetching || fetched === null) return 'unknown';
  return fetched;
}

export function nextOnboardingStep(step: OnboardingStep): OnboardingStep | null {
  return ONBOARDING_STEPS[ONBOARDING_STEPS.indexOf(step) + 1] ?? null;
}

export function onboardingStepLabel(step: OnboardingStep): string {
  return `Step ${ONBOARDING_STEPS.indexOf(step) + 1} of ${ONBOARDING_STEPS.length}`;
}

export function beginnerProgram(entries: readonly TemplateListEntry[]): { key: string; name: string } | null {
  const entry = entries.find((candidate) => candidate.key === BEGINNER_TEMPLATE);
  return entry?.kind === 'enrollable' ? { key: entry.key, name: entry.name } : null;
}

export type FirstRunCardIcon = 'skill' | 'record' | 'loot';

export interface FirstRunCard {
  icon: FirstRunCardIcon;
  title: string;
  text: string;
}

function definitionWithoutName(entry: GlossaryEntry): string {
  const body = entry.definition.slice(entry.name.length + ': '.length);
  return `${body.charAt(0).toUpperCase()}${body.slice(1)}`;
}

export const FIRST_RUN_CARDS: readonly FirstRunCard[] = [
  { icon: 'skill', title: 'Skills & XP', text: definitionWithoutName(GLOSSARY.xp) },
  { icon: 'record', title: 'Records', text: definitionWithoutName(GLOSSARY.pr) },
  { icon: 'loot', title: 'Loot', text: definitionWithoutName(GLOSSARY.loot) },
];
