import {
  type EffortInputType,
  type FactSet,
  type Position,
  type ProgramDefinition,
  type ProgramEnrollment,
  type ProgramFact,
  type ProgramState,
  programStateAt,
  type ReferenceState,
  resolvePrescription,
  type ResolvedSlot,
} from '@domain/index.ts';
import { type FactClock, sessionFact, skipDayFact } from './facts.ts';

export interface LoggedEffort {
  type: EffortInputType;
  value: number;
}

export interface DayLog {
  reps?: Readonly<Record<string, number>>;
  weightsKg?: Readonly<Record<string, number>>;
  efforts?: Readonly<Record<string, LoggedEffort>>;
  missedLifts?: readonly string[];
  skip?: boolean;
}

function lastRequiredIndex(slot: ResolvedSlot): number {
  if (slot.kind !== 'exercise') return -1;
  return slot.sets.reduce((last, set, index) => (set.optional ? last : index), -1);
}

export function loggedAsPrescribed(resolved: readonly ResolvedSlot[], log: DayLog = {}): FactSet[] {
  return resolved.flatMap((slot) => {
    if (slot.kind !== 'exercise') return [];
    const missed = log.missedLifts?.includes(slot.lift) ?? false;
    const missedIndex = missed ? lastRequiredIndex(slot) : -1;
    return slot.sets.flatMap((set, index): FactSet[] => {
      if (!set.snapshot) return [];
      const missedReps = index === missedIndex ? (set.snapshot.minReps ?? set.snapshot.reps) - 1 : undefined;
      const effort = log.efforts?.[set.ref];
      return [
        {
          exerciseId: slot.exerciseId,
          weightKg: log.weightsKg?.[set.ref] ?? set.snapshot.weightKg,
          reps: log.reps?.[set.ref] ?? missedReps ?? set.snapshot.reps,
          effortInputType: effort?.type ?? null,
          effortValue: effort?.value ?? null,
          prescription: set.snapshot,
        },
      ];
    });
  });
}

export function resolveAt(
  definition: ProgramDefinition,
  enrollment: ProgramEnrollment,
  state: ReferenceState,
  position: Position,
): ResolvedSlot[] {
  return resolvePrescription(definition, enrollment, state, position, {});
}

export function resolveNext(
  definition: ProgramDefinition,
  enrollment: ProgramEnrollment,
  state: ProgramState,
): ResolvedSlot[] {
  return resolveAt(definition, enrollment, state, state.position);
}

export interface Followed {
  facts: ProgramFact[];
  state: ProgramState;
}

export function followProgram(
  definition: ProgramDefinition,
  enrollment: ProgramEnrollment,
  clock: FactClock,
  days: readonly DayLog[],
  earlierFacts: readonly ProgramFact[] = [],
): Followed {
  const facts = [...earlierFacts];
  for (const day of days) {
    const state = programStateAt(definition, enrollment, facts);
    if (day.skip) {
      facts.push(skipDayFact(clock.next(), state.position));
    } else {
      const sets = loggedAsPrescribed(resolveNext(definition, enrollment, state), day);
      facts.push(sessionFact(clock.next(), state.position, sets));
    }
  }
  return { facts, state: programStateAt(definition, enrollment, facts) };
}

export function asPrescribed(count: number): DayLog[] {
  return Array.from({ length: count }, () => ({}));
}
