import { roundTo } from './math.ts';
import { type PrescriptionSnapshot } from './program-prescription.ts';

const SNAPSHOT_BOUNDS = Object.freeze({
  refLength: { min: 1, max: 100 },
  weightKg: { min: 0, max: 2000 },
  reps: { min: 1, max: 100 },
  minReps: { min: 0 },
});

const SNAPSHOT_KEYS: readonly string[] = ['ref', 'weightKg', 'reps', 'minReps', 'amrap'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStorableRef(ref: unknown): ref is string {
  return (
    typeof ref === 'string' &&
    ref.length >= SNAPSHOT_BOUNDS.refLength.min &&
    ref.length <= SNAPSHOT_BOUNDS.refLength.max &&
    !ref.includes('\u0000')
  );
}

function isWholeNumberBetween(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

export function storableSnapshot(value: unknown): PrescriptionSnapshot | null {
  if (!isRecord(value) || Object.keys(value).some((key) => !SNAPSHOT_KEYS.includes(key))) return null;
  const { ref, weightKg, reps, amrap } = value;
  const minReps = value.minReps ?? null;
  if (!isStorableRef(ref) || typeof amrap !== 'boolean') return null;
  if (typeof weightKg !== 'number' || !Number.isFinite(weightKg)) return null;
  const roundedWeightKg = roundTo(2, weightKg);
  if (roundedWeightKg < SNAPSHOT_BOUNDS.weightKg.min || roundedWeightKg > SNAPSHOT_BOUNDS.weightKg.max) return null;
  if (!isWholeNumberBetween(reps, SNAPSHOT_BOUNDS.reps.min, SNAPSHOT_BOUNDS.reps.max)) return null;
  if (minReps !== null && !isWholeNumberBetween(minReps, SNAPSHOT_BOUNDS.minReps.min, reps)) return null;
  return { ref, weightKg: roundedWeightKg, reps, minReps, amrap };
}

export function storableSnapshots(prescriptions: readonly unknown[]): (PrescriptionSnapshot | null)[] {
  const claimedRefs = new Set<string>();
  return prescriptions.map((prescription) => {
    const snapshot = storableSnapshot(prescription);
    if (snapshot === null || claimedRefs.has(snapshot.ref)) return null;
    claimedRefs.add(snapshot.ref);
    return snapshot;
  });
}
