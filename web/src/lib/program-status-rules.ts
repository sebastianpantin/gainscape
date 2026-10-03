export type ProgramLoadStatus = 'cached' | 'refreshing' | 'failed' | 'none';

export type ProgramRefreshState = 'pending' | 'done' | 'failed';

export interface ProgramLoadInput {
  hasCachedEnrollment: boolean;
  refresh: ProgramRefreshState;
}

const UNCACHED_STATUS: Readonly<Record<ProgramRefreshState, ProgramLoadStatus>> = {
  pending: 'refreshing',
  done: 'none',
  failed: 'failed',
};

const STATUS_TEXT: Readonly<Record<ProgramLoadStatus, string | null>> = {
  cached: null,
  refreshing: 'Loading program…',
  none: "You're not following a program.",
  failed: "Couldn't load your program. Check your connection.",
};

export function programLoadStatus(input: ProgramLoadInput): ProgramLoadStatus {
  return input.hasCachedEnrollment ? 'cached' : UNCACHED_STATUS[input.refresh];
}

export function programStatusText(status: ProgramLoadStatus): string | null {
  return STATUS_TEXT[status];
}
