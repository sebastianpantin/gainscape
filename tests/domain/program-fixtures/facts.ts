import {
  type FactSet,
  type JumpToFact,
  type Position,
  type PrescriptionSnapshot,
  type ReferenceVar,
  type SessionFact,
  type SetReferenceFact,
  type SkipDayFact,
} from '@domain/index.ts';

const CLOCK_START_MS = Date.parse('2026-10-05T06:00:00.000Z');
const MINUTE_MS = 60 * 1000;

export interface FactClock {
  next(): { id: string; at: string };
}

export function factClock(prefix = 'fact'): FactClock {
  let tick = 0;
  return {
    next() {
      tick += 1;
      return {
        id: `${prefix}-${String(tick).padStart(5, '0')}`,
        at: new Date(CLOCK_START_MS + tick * MINUTE_MS).toISOString(),
      };
    },
  };
}

export interface SnapshotShape {
  weightKg: number;
  reps: number;
  amrap?: boolean;
  minReps?: number | null;
}

export function snapshot(ref: string, shape: SnapshotShape): PrescriptionSnapshot {
  return {
    ref,
    weightKg: shape.weightKg,
    reps: shape.reps,
    minReps: shape.minReps ?? null,
    amrap: shape.amrap ?? false,
  };
}

export function loggedSet(
  exerciseId: string,
  logged: { weightKg: number; reps: number },
  prescription: PrescriptionSnapshot | null,
): FactSet {
  return {
    exerciseId,
    weightKg: logged.weightKg,
    reps: logged.reps,
    effortInputType: null,
    effortValue: null,
    prescription,
  };
}

export function setAsPrescribed(exerciseId: string, ref: string, shape: SnapshotShape, loggedReps?: number): FactSet {
  return loggedSet(exerciseId, { weightKg: shape.weightKg, reps: loggedReps ?? shape.reps }, snapshot(ref, shape));
}

export function unprescribedSet(exerciseId: string, weightKg: number, reps: number): FactSet {
  return loggedSet(exerciseId, { weightKg, reps }, null);
}

export function sessionFact(
  stamp: { id: string; at: string },
  position: Position,
  sets: FactSet[],
  local?: boolean,
): SessionFact {
  return { kind: 'session', ...stamp, position, sets, ...(local ? { local } : {}) };
}

export function setReferenceFact(
  stamp: { id: string; at: string },
  lift: string,
  variable: ReferenceVar,
  value: number,
): SetReferenceFact {
  return { kind: 'set_reference', ...stamp, lift, var: variable, value };
}

export function skipDayFact(stamp: { id: string; at: string }, position: Position): SkipDayFact {
  return { kind: 'skip_day', ...stamp, position };
}

export function jumpToFact(stamp: { id: string; at: string }, position: Position): JumpToFact {
  return { kind: 'jump_to', ...stamp, position };
}
