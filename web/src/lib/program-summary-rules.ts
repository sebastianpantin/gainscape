import { type ProgramDefinition, type ProgramEnrollment, type ProgramState } from '@domain/index.ts';

export const DISMISS_SUMMARY_LABEL = 'Dismiss';

export interface RolloverSummary {
  key: string;
  title: string;
  lines: string[];
}

export function rolloverSummary(
  definition: ProgramDefinition,
  enrollment: ProgramEnrollment,
  state: ProgramState,
): RolloverSummary | null {
  throw new Error(
    `rolloverSummary is not implemented: ${definition.key} ${enrollment.id} at ${JSON.stringify(state.position)}`,
  );
}
