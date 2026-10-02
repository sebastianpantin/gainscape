export type ProgramLoadStatus = 'cached' | 'refreshing' | 'failed' | 'none';

export type ProgramRefreshState = 'pending' | 'done' | 'failed';

export interface ProgramLoadInput {
  hasCachedEnrollment: boolean;
  refresh: ProgramRefreshState;
}

export function programLoadStatus(input: ProgramLoadInput): ProgramLoadStatus {
  void input;
  throw new Error('not implemented');
}

export function programStatusText(status: ProgramLoadStatus): string | null {
  void status;
  throw new Error('not implemented');
}
