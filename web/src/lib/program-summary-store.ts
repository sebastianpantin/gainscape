const SUMMARY_KEY_PREFIX = 'gainscape.program-summary.dismissed.';

function dismissedKey(userId: string): string {
  return `${SUMMARY_KEY_PREFIX}${userId}`;
}

function readDismissed(storage: Storage | null, userId: string): string[] {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(dismissedKey(userId)) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === 'string') : [];
  } catch {
    return [];
  }
}

export function isSummaryDismissed(storage: Storage | null, userId: string, summaryKey: string): boolean {
  return readDismissed(storage, userId).includes(summaryKey);
}

export function dismissSummary(storage: Storage | null, userId: string, summaryKey: string): void {
  const dismissed = readDismissed(storage, userId);
  if (dismissed.includes(summaryKey)) return;
  try {
    storage?.setItem(dismissedKey(userId), JSON.stringify([...dismissed, summaryKey]));
  } catch {
    return;
  }
}
