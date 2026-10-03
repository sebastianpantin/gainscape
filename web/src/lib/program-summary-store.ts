export function isSummaryDismissed(storage: Storage | null, userId: string, summaryKey: string): boolean {
  throw new Error(`isSummaryDismissed is not implemented: ${storage === null} ${userId} ${summaryKey}`);
}

export function dismissSummary(storage: Storage | null, userId: string, summaryKey: string): void {
  throw new Error(`dismissSummary is not implemented: ${storage === null} ${userId} ${summaryKey}`);
}
