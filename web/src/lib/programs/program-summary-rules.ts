import {
  type CyclePosition,
  isCyclePosition,
  isRotationPosition,
  type Position,
  type ProgramDefinition,
  type ProgramEnrollment,
  type ProgramState,
  type ReferenceChange,
  type WeeklyPosition,
} from '@domain/index.ts';
import { compareWeeks } from '@domain/program-schedule.ts';
import { liftName, REFERENCE_VAR_LABELS, shownReference } from './program-enroll-rules.ts';
import { referenceFieldKey } from './program-reference-rules.ts';
import { weekLabel } from './program-today-rules.ts';

export const DISMISS_SUMMARY_LABEL = 'Dismiss';

interface RolloverSummary {
  key: string;
  title: string;
  lines: string[];
}

function finishedWeek(definition: ProgramDefinition, position: Position): CyclePosition | WeeklyPosition | null {
  if (isRotationPosition(position)) return null;
  if (!isCyclePosition(position)) return position.week > 1 ? { week: position.week - 1, day: position.day } : null;
  if (position.week > 1) return { ...position, week: position.week - 1 };
  const schedule = definition.schedule;
  if (position.cycle <= 1 || schedule.kind !== 'cycle') return null;
  return { cycle: position.cycle - 1, week: schedule.weeksPerCycle, day: position.day };
}

function finishedTitle(definition: ProgramDefinition, week: CyclePosition | WeeklyPosition): string {
  const schedule = definition.schedule;
  if (isCyclePosition(week) && schedule.kind === 'cycle' && week.week === schedule.weeksPerCycle)
    return `Cycle ${week.cycle} complete`;
  if (isCyclePosition(week)) return `Cycle ${week.cycle} week ${week.week} complete`;
  return `Week ${week.week} complete`;
}

function netChanges(changes: readonly ReferenceChange[]): ReferenceChange[] {
  const byReference = new Map<string, ReferenceChange>();
  for (const change of changes) {
    const key = referenceFieldKey(change);
    const earlier = byReference.get(key);
    byReference.set(key, earlier ? { ...change, from: earlier.from } : change);
  }
  return [...byReference.values()].filter((change) => shownReference(change.from) !== shownReference(change.to));
}

export function rolloverSummary(
  definition: ProgramDefinition,
  enrollment: ProgramEnrollment,
  state: ProgramState,
): RolloverSummary | null {
  const week = finishedWeek(definition, state.position);
  if (week === null) return null;
  const changes = netChanges(
    state.history.filter((change) => change.reason !== 'set_reference' && compareWeeks(change.position, week) === 0),
  );
  if (changes.length === 0) return null;
  return {
    key: `${enrollment.id}:${weekLabel(week)}`,
    title: finishedTitle(definition, week),
    lines: changes.map(
      (change) =>
        `${liftName(definition, change.lift)} ${REFERENCE_VAR_LABELS[change.var]} ${shownReference(change.from)} → ${shownReference(change.to)} ${enrollment.unit}`,
    ),
  };
}
