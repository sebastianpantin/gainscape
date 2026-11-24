import type { GarminActivity } from '@domain/index.ts';
import type { ImportSummary } from './import-review-rules.ts';

export interface PendingImport {
  fileName: string;
  activities: GarminActivity[];
}

let pendingImport: PendingImport | null = null;

export function holdPendingImport(pending: PendingImport): void {
  pendingImport = pending;
}

export function heldPendingImport(): PendingImport | null {
  return pendingImport;
}

export function dropPendingImport(): void {
  pendingImport = null;
}

let finishedImport: ImportSummary | null = null;

export function holdFinishedImport(summary: ImportSummary): void {
  finishedImport = summary;
}

export function heldFinishedImport(): ImportSummary | null {
  return finishedImport;
}

export function dropFinishedImport(): void {
  finishedImport = null;
}
