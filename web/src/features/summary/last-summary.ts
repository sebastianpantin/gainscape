import type { SessionSummary } from '@domain/types.ts';
import type { RememberedTiming } from '../../lib/session-timing-rules.ts';
import { parsedDraftChallenge } from '../../lib/challenge-rules.ts';
import type { DraftChallenge } from '../../offline/draft-format.ts';

export interface PlannedChallenge {
  plannedChallenge?: DraftChallenge | null;
}

type RememberedSummary = SessionSummary & RememberedTiming & PlannedChallenge;

const LAST_SUMMARY_KEY = 'gainscape.last-summary';

interface RememberedEntry {
  userId?: unknown;
  summary?: RememberedSummary;
}

function rememberedEntry(): RememberedEntry | null {
  const raw = sessionStorage.getItem(LAST_SUMMARY_KEY);
  return raw ? (JSON.parse(raw) as RememberedEntry) : null;
}

export function rememberLastSummary(userId: string, summary: RememberedSummary): void {
  try {
    sessionStorage.setItem(LAST_SUMMARY_KEY, JSON.stringify({ userId, summary }));
  } catch {
    return;
  }
}

export function recallLastSummary(userId?: string): RememberedSummary | null {
  try {
    const entry = rememberedEntry();
    if (typeof entry?.userId !== 'string' || !entry.summary) return null;
    if (userId !== undefined && entry.userId !== userId) return null;
    const remembered = entry.summary;
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
