import { keyedStore } from './keyed-store.ts';

const dismissedSummaries = keyedStore('gainscape.program-summary.dismissed.', (raw) => {
  const parsed: unknown = JSON.parse(raw ?? '[]');
  return Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === 'string') : [];
});

export function isSummaryDismissed(storage: Storage | null, userId: string, summaryKey: string): boolean {
  return dismissedSummaries.read(storage, userId).includes(summaryKey);
}

export function dismissSummary(storage: Storage | null, userId: string, summaryKey: string): void {
  const dismissed = dismissedSummaries.read(storage, userId);
  if (!dismissed.includes(summaryKey)) dismissedSummaries.save(storage, userId, [...dismissed, summaryKey]);
}

export const { forget: forgetDismissedSummaries } = dismissedSummaries;
