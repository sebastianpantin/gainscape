import { type ProgramFact, type SessionFact } from '@domain/index.ts';
import { type ProgramTemplateRow } from '../../web/src/lib/programs/program-enroll-rules.ts';
import { type EnrollmentRow } from '../../web/src/lib/programs/program-facts-rules.ts';
import { MADCOW_5X5 } from '../domain/program-fixtures/madcow_5x5.ts';

export const STORED_ENROLLMENT_PREFIX = 'gainscape.powerlifting-programs.v1.';

export const MADCOW_TEMPLATE: ProgramTemplateRow = {
  key: 'madcow_5x5',
  version: 1,
  name: 'Madcow 5x5',
  definition: MADCOW_5X5,
};

export interface StoredRecordInput {
  templates?: ProgramTemplateRow[];
  enrollment?: EnrollmentRow | null;
  serverFacts?: ProgramFact[];
  localAppends?: { fact: SessionFact; appendedAt: number }[];
  generation?: number;
  refreshed?: true;
}

export function storedRecord(userId: string, input: StoredRecordInput): Record<string, unknown> {
  const enrollment = input.enrollment ?? null;
  return {
    v: 1,
    userId,
    templates: input.templates ?? [MADCOW_TEMPLATE],
    enrollment,
    facts: enrollment && {
      enrollmentId: enrollment.id,
      generation: input.generation ?? 0,
      serverFacts: input.serverFacts ?? [],
      localAppends: input.localAppends ?? [],
    },
    ...(input.refreshed ? { refreshed: true } : {}),
  };
}

export function storeRaw(storage: Storage, userId: string, value: unknown): void {
  storage.setItem(`${STORED_ENROLLMENT_PREFIX}${userId}`, typeof value === 'string' ? value : JSON.stringify(value));
}

export function storeRecord(storage: Storage, userId: string, input: StoredRecordInput): void {
  storeRaw(storage, userId, storedRecord(userId, input));
}
