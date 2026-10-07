import { RATE_LIMITED_CODE, waitText } from '../../lib/rate-limit.ts';

const EXERCISE_CHANGED_REASONS = new Set(['bodyweight_load_not_zero', 'unknown_exercise']);
const LONG_SYNC_WAIT_MS = 60_000;
const MS_PER_SECOND = 1000;

export function syncProblemText(lastProblem: string, waitMs: number | undefined): string {
  if (lastProblem !== RATE_LIMITED_CODE) {
    return `Couldn't reach the server (${lastProblem}). Retrying — your workout is saved on this device.`;
  }
  if (waitMs !== undefined && waitMs > LONG_SYNC_WAIT_MS) {
    return `Sync limit reached; this workout will sync in ${waitText(waitMs / MS_PER_SECOND)}. It's saved on this device.`;
  }
  return "Sync limit reached; retrying shortly. It's saved on this device.";
}

export function stalledSyncText(reason: string): string {
  return `The server keeps failing to save this workout (${reason}). It's saved on this device; try again later.`;
}

export function rejectionText(reason: string): string {
  return EXERCISE_CHANGED_REASONS.has(reason)
    ? 'Load type of an exercise changed; check the weights'
    : `The server rejected this workout: ${reason}`;
}
