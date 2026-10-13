import { REP_MAX_SLOT_COUNT } from '@domain/types.ts';
import type { LoadType } from '../../lib/exercises/catalog-rules.ts';
import { formatLoad } from '../../lib/format.ts';
import type { UnitPref } from '../../lib/profile/profile-rules.ts';

export function slotClass(slot: { exact: boolean } | null): string {
  if (!slot) return 'record-slot empty';
  return slot.exact ? 'record-slot filled' : 'record-slot';
}

export function slotText(
  slot: { loadKg: number | null } | null,
  loadType: LoadType,
  unit: UnitPref,
  weightsHidden = false,
): string {
  if (!slot) return '—';
  if (slot.loadKg === null || weightsHidden) return 'Set';
  return formatLoad(slot.loadKg, loadType, unit);
}

export function slotLabel(
  reps: number,
  slot: { loadKg: number | null; exact: boolean } | null,
  loadType: LoadType,
  unit: UnitPref,
  weightsHidden = false,
): string {
  if (!slot) return `${reps}RM empty`;
  const load = slot.loadKg === null || weightsHidden ? 'recorded' : formatLoad(slot.loadKg, loadType, unit);
  const named = `${reps}RM ${load}`;
  return slot.exact ? named : `${named}, beaten by a higher-rep set`;
}

export function slotsByReps<S extends { reps: number }>(repMaxes: readonly S[]): (S | null)[] {
  return Array.from(
    { length: REP_MAX_SLOT_COUNT },
    (_, index) => repMaxes.find((slot) => slot.reps === index + 1) ?? null,
  );
}
