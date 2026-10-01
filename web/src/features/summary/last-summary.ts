import type { SessionSummary } from '@domain/types.ts';

const LAST_SUMMARY_KEY = 'gainscape.last-summary';

export function rememberLastSummary(summary: SessionSummary): void {
  try {
    sessionStorage.setItem(LAST_SUMMARY_KEY, JSON.stringify(summary));
  } catch {
    return;
  }
}

export function recallLastSummary(): SessionSummary | null {
  try {
    const raw = sessionStorage.getItem(LAST_SUMMARY_KEY);
    return raw ? (JSON.parse(raw) as SessionSummary) : null;
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
