import { type TemplateListEntry, templateScheduleText } from './program-enroll-rules.ts';
import { type ProgramLoadStatus } from './program-status-rules.ts';
import { type ActiveProgram } from './program-today-rules.ts';

export const FEATURED_TEMPLATE_KEYS = ['stronglifts_5x5', 'gzclp', 'five_three_one'] as const;

interface FeaturedProgram {
  key: string;
  name: string;
  schedule: string;
}

export function featuredPrograms(entries: readonly TemplateListEntry[]): FeaturedProgram[] {
  return FEATURED_TEMPLATE_KEYS.flatMap((key) => {
    const entry = entries.find((candidate) => candidate.key === key);
    return entry?.kind === 'enrollable'
      ? [{ key, name: entry.name, schedule: templateScheduleText(entry.definition) }]
      : [];
  });
}

export function showsFollowProgramCard(loadStatus: ProgramLoadStatus, dismissed: boolean): boolean {
  return loadStatus === 'none' && !dismissed;
}

export function followedProgramName(program: ActiveProgram): string | null {
  return program.kind === 'ready' || program.kind === 'needs_update' ? program.name : null;
}
