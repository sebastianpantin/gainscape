import { parseSessionBaseline, type SessionBaseline } from './session-baseline-rules.ts';

const SESSION_BASELINE_KEY_PREFIX = 'gainscape.session-baseline.';

function sessionBaselineKey(userId: string): string {
  return `${SESSION_BASELINE_KEY_PREFIX}${userId}`;
}

export function readSessionBaseline(storage: Storage | null, userId: string): SessionBaseline | null {
  try {
    return parseSessionBaseline(storage?.getItem(sessionBaselineKey(userId)) ?? null);
  } catch {
    return null;
  }
}

export function saveSessionBaseline(storage: Storage | null, userId: string, baseline: SessionBaseline): void {
  try {
    storage?.setItem(sessionBaselineKey(userId), JSON.stringify(baseline));
  } catch {
    return;
  }
}

export function forgetSessionBaseline(storage: Storage | null, userId: string): void {
  try {
    storage?.removeItem(sessionBaselineKey(userId));
  } catch {
    return;
  }
}
