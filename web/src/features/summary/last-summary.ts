import type { SessionSummary } from '@domain/types.ts';
import type { RememberedTiming } from '../../lib/session-timing-rules.ts';
import { parsedDraftChallenge } from '../../lib/challenge-rules.ts';
import type { DraftChallenge } from '../../offline/draft-format.ts';

export interface PlannedChallenge {
  plannedChallenge?: DraftChallenge | null;
}

type RememberedSummary = SessionSummary & RememberedTiming & PlannedChallenge;

const LAST_SUMMARY_KEY = 'gainscape.last-summary';

export function rememberLastSummary(summary: RememberedSummary): void {
  try {
    sessionStorage.setItem(LAST_SUMMARY_KEY, JSON.stringify(summary));
  } catch {
    return;
  }
}

export function recallLastSummary(): RememberedSummary | null {
  try {
    const raw = sessionStorage.getItem(LAST_SUMMARY_KEY);
    if (!raw) return null;
    const remembered = JSON.parse(raw) as RememberedSummary;
    return 'plannedChallenge' in remembered
      ? { ...remembered, plannedChallenge: parsedDraftChallenge(remembered.plannedChallenge) }
      : remembered;
  } catch {
    return null;
  }
}

export function forgetLastSummary(sessionIds: readonly string[]): void {
  try {
    const cached = recallLastSummary();
    if (cached && sessionIds.includes(cached.sessionId)) sessionStorage.removeItem(LAST_SUMMARY_KEY);
  } catch {
    return;
  }
}
