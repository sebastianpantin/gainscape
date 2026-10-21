import { type TemplateListEntry, templateScheduleText } from './program-enroll-rules.ts';
import { type ProgramLoadStatus } from './program-status-rules.ts';
import { type ActiveProgram } from './program-today-rules.ts';

export const FEATURED_TEMPLATE_KEYS = ['stronglifts_5x5', 'gzclp', 'five_three_one'] as const;

export interface FeaturedProgram {
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

export function showsFollowProgramCard(
  loadStatus: ProgramLoadStatus,
  dismissed: boolean,
  featured: readonly FeaturedProgram[],
): boolean {
  return loadStatus === 'none' && !dismissed && featured.length > 0;
}

export function followingText(program: ActiveProgram): string | null {
  if (program.kind === 'none') return null;
  return program.kind === 'template_missing' ? "You're following a program" : `You're following ${program.name}`;
}
