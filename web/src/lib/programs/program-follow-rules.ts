import { parseProgramDefinition, type ProgramDefinition, type ProgramState, type WeightUnit } from '@domain/index.ts';
import { customLiftKey, customTemplateKey, enrolledTemplate, type ProgramTemplateRow } from './program-enroll-rules.ts';
import { type LoadType } from '../exercises/catalog-rules.ts';
import { type EnrollmentRow } from './program-facts-rules.ts';
import type { ProgramDoc } from './programs.ts';

export type FollowStatus = 'not_following' | 'undecided' | 'current' | 'outdated';

export interface CarriedFollow {
  unit: WeightUnit;
  workingWeights: Record<string, number>;
}

type PlannedExercise = ProgramDoc['days'][number]['exercises'][number];

type LoadTypeOf = (exerciseId: string) => LoadType | null;

const WORKING_WEIGHT_LOAD = 'pct 1 workingWeight';
const LAST_LOGGED_LOAD = 'lastLogged';

function slotLine(lift: string, sets: unknown, reps: unknown, maxReps: unknown, load: string, judged: boolean): string {
  return JSON.stringify([lift, sets, reps, maxReps ?? reps, load, judged]);
}

function compiledProgression(planned: PlannedExercise, loadType: LoadType | null): PlannedExercise['progression'] {
  return loadType === null || loadType === 'external' ? planned.progression : { kind: 'none' };
}

function plannedSlotLine(planned: PlannedExercise, loadTypeOf: LoadTypeOf): string {
  const progression = compiledProgression(planned, loadTypeOf(planned.exerciseId));
  const load = progression.kind === 'none' ? LAST_LOGGED_LOAD : WORKING_WEIGHT_LOAD;
  const { exerciseId, targetSets, targetRepsMin, targetRepsMax } = planned;
  const judged = progression.kind === 'linear';
  return slotLine(customLiftKey(exerciseId), targetSets, targetRepsMin, targetRepsMax, load, judged);
}

function plannedRuleLines(program: ProgramDoc, loadTypeOf: LoadTypeOf): string[] {
  const rules = new Map<string, string>();
  for (const day of program.days)
    for (const planned of day.exercises) {
      const lift = customLiftKey(planned.exerciseId);
      const progression = compiledProgression(planned, loadTypeOf(planned.exerciseId));
      if (progression.kind === 'linear' && !rules.has(lift))
        rules.set(lift, JSON.stringify([lift, progression.incrementKg, progression.incrementLb]));
    }
  return [...rules.values()].sort();
}

function programLines(program: ProgramDoc, loadTypeOf: LoadTypeOf): string[] {
  return [
    JSON.stringify(program.name),
    ...program.days.flatMap((day) => [
      JSON.stringify(day.name),
      ...day.exercises.map((planned) => plannedSlotLine(planned, loadTypeOf)),
    ]),
    ...plannedRuleLines(program, loadTypeOf),
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

export function isFollowing(programId: string, enrollment: EnrollmentRow | null): enrollment is EnrollmentRow {
  return enrollment !== null && enrollment.ended_at === null && isEnrolledIn(programId, enrollment);
}

export function followStatus(
  program: ProgramDoc,
  enrollment: EnrollmentRow | null,
  templates: readonly ProgramTemplateRow[],
  loadTypeOf: LoadTypeOf | null,
): FollowStatus {
  if (!isFollowing(program.id, enrollment)) return 'not_following';
  if (loadTypeOf === null) return 'undecided';
  const template = enrolledTemplate(templates, enrollment);
  const parsed = template ? parseProgramDefinition(template.definition) : null;
  if (parsed?.kind !== 'ok') return 'current';
  const followed = definitionLines(parsed.definition).join('\n');
  return followed === programLines(program, loadTypeOf).join('\n') ? 'current' : 'outdated';
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
