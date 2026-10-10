import { parseProgramDefinition, type ProgramDefinition, type ProgramState, type WeightUnit } from '@domain/index.ts';
import { customLiftKey, customTemplateKey, enrolledTemplate, type ProgramTemplateRow } from './program-enroll-rules.ts';
import { type EnrollmentRow } from './program-facts-rules.ts';
import type { ProgramDoc } from './programs.ts';

export type FollowStatus = 'not_following' | 'current' | 'outdated';

export interface CarriedFollow {
  unit: WeightUnit;
  workingWeights: Record<string, number>;
}

type PlannedExercise = ProgramDoc['days'][number]['exercises'][number];

const WORKING_WEIGHT_LOAD = 'pct 1 workingWeight';
const LAST_LOGGED_LOAD = 'lastLogged';

function slotLine(lift: string, sets: unknown, reps: unknown, maxReps: unknown, load: string, judged: boolean): string {
  return JSON.stringify([lift, sets, reps, maxReps ?? reps, load, judged]);
}

function plannedSlotLine(planned: PlannedExercise): string {
  const load = planned.progression.kind === 'none' ? LAST_LOGGED_LOAD : WORKING_WEIGHT_LOAD;
  const { exerciseId, targetSets, targetRepsMin, targetRepsMax } = planned;
  const judged = planned.progression.kind === 'linear';
  return slotLine(customLiftKey(exerciseId), targetSets, targetRepsMin, targetRepsMax, load, judged);
}

function plannedRuleLines(program: ProgramDoc): string[] {
  const rules = new Map<string, string>();
  for (const day of program.days)
    for (const planned of day.exercises) {
      const lift = customLiftKey(planned.exerciseId);
      if (planned.progression.kind === 'linear' && !rules.has(lift))
        rules.set(lift, JSON.stringify([lift, planned.progression.incrementKg, planned.progression.incrementLb]));
    }
  return [...rules.values()].sort();
}

function programLines(program: ProgramDoc): string[] {
  return [
    JSON.stringify(program.name),
    ...program.days.flatMap((day) => [JSON.stringify(day.name), ...day.exercises.map(plannedSlotLine)]),
    ...plannedRuleLines(program),
  ];
}

function loadLabel(load: { kind: string; pct?: unknown; of?: unknown }): string {
  return load.kind === LAST_LOGGED_LOAD ? LAST_LOGGED_LOAD : [load.kind, load.pct, load.of].join(' ');
}

function definitionLines(definition: ProgramDefinition): string[] {
  const judged = new Set(definition.progression.flatMap((rule) => rule.judgedSlots));
  const days = definition.schedule.kind === 'rotation' ? definition.schedule.days : [];
  const slots = days.flatMap((day) => [
    JSON.stringify(day.name),
    ...day.slots.map((slot) =>
      slot.scheme.kind === 'repeat'
        ? slotLine(
            slot.lift,
            slot.scheme.count,
            slot.scheme.reps,
            slot.scheme.maxReps,
            loadLabel(slot.scheme.load),
            judged.has(slot.id),
          )
        : JSON.stringify(slot.scheme.kind),
    ),
  ]);
  const rules = definition.progression.map((rule) => {
    const [adjustment] = rule.onMet;
    const by = adjustment?.kind === 'increment' && 'by' in adjustment ? adjustment.by : null;
    return by !== null && 'kg' in by ? JSON.stringify([rule.lift, by.kg, by.lb]) : JSON.stringify(rule.lift);
  });
  rules.sort();
  return [JSON.stringify(definition.name), ...slots, ...rules];
}

export function isEnrolledIn(programId: string, enrollment: EnrollmentRow | null): boolean {
  return enrollment?.template_key === customTemplateKey(programId);
}

export function followStatus(
  program: ProgramDoc,
  enrollment: EnrollmentRow | null,
  templates: readonly ProgramTemplateRow[],
): FollowStatus {
  if (enrollment === null || enrollment.ended_at !== null || !isEnrolledIn(program.id, enrollment))
    return 'not_following';
  const template = enrolledTemplate(templates, enrollment);
  const parsed = template ? parseProgramDefinition(template.definition) : null;
  if (parsed?.kind !== 'ok') return 'current';
  const followed = definitionLines(parsed.definition).join('\n');
  return followed === programLines(program).join('\n') ? 'current' : 'outdated';
}

export function workingWeights(state: ProgramState): Record<string, number> {
  return Object.fromEntries(
    Object.entries(state.refs).flatMap(([lift, refs]) =>
      refs?.workingWeight === undefined ? [] : [[lift, refs.workingWeight]],
    ),
  );
}

export function carriedInputs(
  weights: Readonly<Record<string, number>>,
  definition: ProgramDefinition,
): Record<string, string> {
  const lifts = definition.inputs.flatMap((input) => (input.kinds.includes('workingWeight') ? input.lifts : []));
  return Object.fromEntries(lifts.map((lift) => [lift, weights[lift] === undefined ? '' : String(weights[lift])]));
}

function isRecordOf(value: unknown, isEntry: (entry: unknown) => boolean): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && Object.values(value).every(isEntry);
}

export function carriedFollowOf(locationState: unknown): CarriedFollow | null {
  if (typeof locationState !== 'object' || locationState === null || !('carried' in locationState)) return null;
  const { carried } = locationState;
  if (typeof carried !== 'object' || carried === null) return null;
  const { unit, workingWeights: weights } = carried as { unit?: unknown; workingWeights?: unknown };
  if (unit !== 'kg' && unit !== 'lb') return null;
  if (!isRecordOf(weights, (entry) => typeof entry === 'number' && Number.isFinite(entry))) return null;
  return { unit, workingWeights: weights as Record<string, number> };
}
