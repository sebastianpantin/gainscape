import {
  availableDays,
  isCyclePosition,
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
import { liftName, pctLabel, UPDATE_APP_TEXT } from './program-enroll-rules.ts';

export interface DayChoice {
  position: Position;
  label: string;
  suggested: boolean;
}

export interface PrescriptionRow {
  ref: string;
  setNumber: number;
  weight: number | null;
  unit: WeightUnit;
  repsLabel: string;
  amrapBadge: string | null;
  pctLabel: string | null;
  optional: boolean;
  line: string;
}

export type PrescriptionCard =
  | { kind: 'exercise'; slotId: string; title: string; exerciseName: string; rows: PrescriptionRow[] }
  | { kind: 'unsupported'; slotId: string; title: string; message: string };

function weekLabel(position: Position): string {
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
  return JSON.stringify(a) === JSON.stringify(b);
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

function prescriptionRow(set: PrescribedSet, index: number, unit: WeightUnit): PrescriptionRow {
  const weight = set.weightKg === null ? null : shownWeight(set.weightKg, unit);
  const repsLabel = repsLabelOf(set);
  const shownPct = set.pct === null ? null : pctLabel(set.pct);
  const load = weight === null ? 'any weight' : `${weight} ${unit}`;
  const details = [shownPct, set.optional ? 'optional' : null].filter((detail) => detail !== null);
  return {
    ref: set.ref,
    setNumber: index + 1,
    weight,
    unit,
    repsLabel,
    amrapBadge: set.amrap ? repsLabel : null,
    pctLabel: shownPct,
    optional: set.optional,
    line: [`${load} × ${repsLabel}`, ...details].join(' · '),
  };
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
    rows: slot.sets.map((set, index) => prescriptionRow(set, index, unit)),
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
