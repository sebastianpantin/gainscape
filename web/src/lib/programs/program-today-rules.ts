import {
  availableDays,
  parseProgramDefinition,
  type ProgramEnrollment,
  type ProgramFact,
  type ProgramState,
  programStateAt,
  isCyclePosition,
  isPositionInSchedule,
  isRetestRef,
  isRotationPosition,
  type Position,
  type PrescribedExercise,
  type PrescribedSet,
  type PrescriptionSnapshot,
  type ProgramDefinition,
  type ResolvedSlot,
  type ScheduleCursor,
  shownWeight,
  type WeightUnit,
} from '@domain/index.ts';
import { dayOf } from '@domain/program-schedule.ts';
import {
  enrolledTemplate,
  liftName,
  pctLabel,
  type ProgramTemplateRow,
  UPDATE_APP_TEXT,
} from './program-enroll-rules.ts';
import { type EnrollmentRow, enrollmentFromRow, isProgramFact } from './program-facts-rules.ts';

export interface DayChoice {
  position: Position;
  label: string;
  suggested: boolean;
}

export type PrescriptionCard =
  | {
      kind: 'exercise';
      slotId: string;
      title: string;
      exerciseName: string;
      lines: string[];
    }
  | { kind: 'unsupported'; slotId: string; title: string; message: string };

export function weekLabel(position: Position): string {
  if (isRotationPosition(position)) return `Session ${position.index + 1}`;
  return isCyclePosition(position) ? `C${position.cycle} W${position.week}` : `W${position.week}`;
}

export function positionLabel(definition: ProgramDefinition, position: Position): string {
  const day = dayOf(definition, position);
  return day ? `${weekLabel(position)} ${day.name}` : weekLabel(position);
}

export function startLabel(templateName: string, definition: ProgramDefinition, position: Position): string {
  return `Start: ${templateName} — ${positionLabel(definition, position)}`;
}

export function dayChoices(definition: ProgramDefinition, cursor: ScheduleCursor): DayChoice[] {
  return availableDays(definition, cursor).map((position, index) => ({
    position,
    label: positionLabel(definition, position),
    suggested: index === 0,
  }));
}

function samePosition(a: Position, b: Position): boolean {
  const aKeys = Object.keys(a);
  const bKeys = new Set(Object.keys(b));
  return (
    aKeys.length === bKeys.size &&
    aKeys.every((key) => bKeys.has(key) && a[key as keyof Position] === b[key as keyof Position])
  );
}

export function pickedDay(choices: readonly DayChoice[], picked: Position | null): Position {
  const chosen = picked === null ? undefined : choices.find((choice) => samePosition(choice.position, picked));
  return (chosen ?? choices.find((choice) => choice.suggested) ?? choices[0]).position;
}

export function amrapBadgeOf(prescription: PrescriptionSnapshot | null | undefined): string | null {
  if (!prescription?.amrap) return null;
  return `${prescription.minReps ?? prescription.reps}+`;
}

function repsLabelOf(set: PrescribedSet): string {
  if (set.amrap) return `${set.minReps ?? set.reps}+`;
  if (set.reps === null) return 'any reps';
  return set.maxReps === null ? String(set.reps) : `${set.reps}–${set.maxReps}`;
}

function setDetails(set: PrescribedSet, shownPct: string | null): string[] {
  return [shownPct, set.optional ? 'optional' : null, isRetestRef(set.ref) ? '5RM test' : null].filter(
    (detail) => detail !== null,
  );
}

function groupedLines(sets: readonly PrescribedSet[], unit: WeightUnit): string[] {
  const everySetAtFullWeight = sets.every((set) => set.pct === 1);
  const groups: { count: number; load: string; reps: string; details: string[]; key: string }[] = [];
  for (const set of sets) {
    const load = set.weightKg === null ? 'any weight' : `${shownWeight(set.weightKg, unit)} ${unit}`;
    const reps = repsLabelOf(set);
    const details = setDetails(set, set.pct === null || everySetAtFullWeight ? null : pctLabel(set.pct));
    const key = [load, reps, ...details].join('|');
    const last = groups.at(-1);
    if (last?.key === key) last.count += 1;
    else groups.push({ count: 1, load, reps, details, key });
  }
  return groups.map(({ count, load, reps, details }) =>
    [count === 1 ? `${load} × ${reps}` : `${count} × ${reps} @ ${load}`, ...details].join(' · '),
  );
}

function exerciseCard(
  definition: ProgramDefinition,
  slot: PrescribedExercise,
  unit: WeightUnit,
  exerciseNames: ReadonlyMap<string, string>,
): PrescriptionCard {
  const known = exerciseNames.get(slot.exerciseId);
  const exerciseName = known ?? `${liftName(definition, slot.lift)} (exercise unavailable)`;
  return {
    kind: 'exercise',
    slotId: slot.slotId,
    title: slot.role === 'main' ? exerciseName : `${exerciseName} — ${slot.role}`,
    exerciseName,
    lines: groupedLines(slot.sets, unit),
  };
}

export function prescriptionCards(
  definition: ProgramDefinition,
  slots: readonly ResolvedSlot[],
  unit: WeightUnit,
  exerciseNames: ReadonlyMap<string, string>,
): PrescriptionCard[] {
  return slots.map((slot) =>
    slot.kind === 'exercise'
      ? exerciseCard(definition, slot, unit, exerciseNames)
      : { kind: 'unsupported', slotId: slot.slotId, title: liftName(definition, slot.lift), message: UPDATE_APP_TEXT },
  );
}

const TEMPLATE_MISSING_TEXT = 'Program details unavailable — reconnect to load them';

export type ActiveProgram =
  | { kind: 'none' }
  | { kind: 'needs_update'; name: string; message: string }
  | { kind: 'template_missing'; message: typeof TEMPLATE_MISSING_TEXT }
  | {
      kind: 'ready';
      name: string;
      templateKey: string;
      definition: ProgramDefinition;
      enrollment: ProgramEnrollment;
      state: ProgramState;
    };

function usableFacts(definition: ProgramDefinition, facts: readonly unknown[]): ProgramFact[] {
  return facts.filter(
    (fact): fact is ProgramFact =>
      isProgramFact(fact) && (fact.kind === 'set_reference' || isPositionInSchedule(definition, fact.position)),
  );
}

export function activeProgram(
  templates: readonly ProgramTemplateRow[],
  enrollmentRow: EnrollmentRow | null,
  facts: readonly ProgramFact[],
): ActiveProgram {
  if (enrollmentRow === null) return { kind: 'none' };
  const template = enrolledTemplate(templates, enrollmentRow);
  if (!template) return { kind: 'template_missing', message: TEMPLATE_MISSING_TEXT };
  const parsed = parseProgramDefinition(template.definition);
  if (parsed.kind !== 'ok') return { kind: 'needs_update', name: template.name, message: UPDATE_APP_TEXT };
  const enrollment = enrollmentFromRow(enrollmentRow);
  return {
    kind: 'ready',
    name: template.name,
    templateKey: template.key,
    definition: parsed.definition,
    enrollment,
    state: programStateAt(parsed.definition, enrollment, usableFacts(parsed.definition, facts)),
  };
}
