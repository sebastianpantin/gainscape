import type { BalanceConfig } from './balance.ts';
import { resolveEffort } from './effort.ts';
import { type CardioInterval, type EffortInputType, type SetInput, setKind } from './types.ts';

interface StoredSetBase {
  id: string;
  exerciseId: string;
  position: number;
  effortInputType: EffortInputType | null;
  effortValue: number | null;
}

export interface StoredLiftSet extends StoredSetBase {
  kind: 'lift';
  weightKg: number;
  effectiveLoadKg: number;
  reps: number;
  isWarmup: boolean;
}

export interface StoredCardioSet extends StoredSetBase {
  kind: 'cardio';
  durationS: number;
  distanceM: number | null;
  interval: CardioInterval | null;
}

export interface StoredHoldSet extends StoredSetBase {
  kind: 'hold';
  weightKg: number;
  effectiveLoadKg: number;
  durationS: number | null;
  distanceM: number | null;
}

export type StoredSet = StoredLiftSet | StoredCardioSet | StoredHoldSet;

function sameExerciseAndValues(requested: SetInput, stored: StoredSet, cfg: BalanceConfig): boolean {
  const effort = resolveEffort(requested.effort, cfg, setKind(requested));
  const sameEffort = effort.effortInputType === stored.effortInputType && effort.effortValue === stored.effortValue;
  if (requested.exerciseId !== stored.exerciseId || !sameEffort) return false;
  if (requested.kind === 'hold' || stored.kind === 'hold') {
    return (
      requested.kind === 'hold' &&
      stored.kind === 'hold' &&
      requested.weightKg === stored.weightKg &&
      requested.durationS === stored.durationS &&
      requested.distanceM === stored.distanceM
    );
  }
  if (requested.kind === 'cardio' || stored.kind === 'cardio') {
    return (
      requested.kind === 'cardio' &&
      stored.kind === 'cardio' &&
      requested.durationS === stored.durationS &&
      requested.distanceM === stored.distanceM &&
      requested.interval?.workS === stored.interval?.workS &&
      requested.interval?.restS === stored.interval?.restS &&
      requested.interval?.rounds === stored.interval?.rounds
    );
  }
  return (
    requested.weightKg === stored.weightKg && requested.reps === stored.reps && requested.isWarmup === stored.isWarmup
  );
}

export function sameSet(requested: SetInput, stored: StoredSet, cfg: BalanceConfig): boolean {
  return requested.position === stored.position && sameExerciseAndValues(requested, stored, cfg);
}

export function unchangedSetIds(
  requested: readonly SetInput[],
  storedById: ReadonlyMap<string, StoredSet>,
  cfg: BalanceConfig,
): string[] {
  return requested.flatMap((set) => {
    const stored = storedById.get(set.id);
    return stored !== undefined && sameExerciseAndValues(set, stored, cfg) ? [set.id] : [];
  });
}

export interface RequestedEdit {
  notes: string | null;
  sets: readonly SetInput[];
}

export function isNoOpEdit(
  requested: RequestedEdit,
  storedNotes: string | null,
  storedById: ReadonlyMap<string, StoredSet>,
  cfg: BalanceConfig,
): boolean {
  if (requested.notes !== storedNotes || requested.sets.length !== storedById.size) return false;
  return requested.sets.every((set) => {
    const stored = storedById.get(set.id);
    return stored !== undefined && sameSet(set, stored, cfg);
  });
}
