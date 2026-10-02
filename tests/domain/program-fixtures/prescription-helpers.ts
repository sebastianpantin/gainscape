import { expect } from 'vitest';
import {
  type PrescribedExercise,
  type ProgramState,
  type ReferenceState,
  type ReferenceVar,
  type ResolvedSlot,
} from '@domain/index.ts';

export function slotOf(resolved: readonly ResolvedSlot[], slotId: string): PrescribedExercise {
  const slot = resolved.find((entry) => entry.slotId === slotId);
  expect(slot, `slot ${slotId} is resolved`).toBeDefined();
  expect(slot?.kind, `slot ${slotId} is a supported exercise`).toBe('exercise');
  return slot as PrescribedExercise;
}

export function weightsOf(resolved: readonly ResolvedSlot[], slotId: string): (number | null)[] {
  return slotOf(resolved, slotId).sets.map((set) => set.weight);
}

export function weightsKgOf(resolved: readonly ResolvedSlot[], slotId: string): (number | null)[] {
  return slotOf(resolved, slotId).sets.map((set) => set.weightKg);
}

export function repsOf(resolved: readonly ResolvedSlot[], slotId: string): (number | null)[] {
  return slotOf(resolved, slotId).sets.map((set) => set.reps);
}

export function slotIdsOf(resolved: readonly ResolvedSlot[]): string[] {
  return resolved.map((entry) => entry.slotId);
}

export function refsState(refs: Record<string, Partial<Record<ReferenceVar, number>>>): ReferenceState {
  return { refs };
}

export function refOf(state: ProgramState, lift: string, variable: ReferenceVar): number {
  const value = state.refs[lift]?.[variable];
  expect(value, `${lift}.${variable} is set`).toBeTypeOf('number');
  return value as number;
}

export function missesOf(state: ProgramState, lift: string): number {
  return state.consecutiveMisses[lift] ?? 0;
}
