import { keyedStore } from '../platform/keyed-store.ts';
import { type TemplateListEntry, templateScheduleText } from './program-enroll-rules.ts';
import { type ProgramLoadStatus } from './program-today-rules.ts';

export const FEATURED_TEMPLATE_KEYS = ['stronglifts_5x5', 'gzclp', 'five_three_one'] as const;

export interface FeaturedProgram {
  key: string;
  name: string;
  schedule: string;
}

const followCardDismissal = keyedStore<boolean>('gainscape.follow-card.', (raw) => JSON.parse(raw ?? 'false') === true);

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

export function isFollowCardDismissed(storage: Storage | null, userId: string): boolean {
  return followCardDismissal.read(storage, userId);
}

export function dismissFollowCard(storage: Storage | null, userId: string): void {
  followCardDismissal.save(storage, userId, true);
}

export const { forget: forgetFollowCardDismissal } = followCardDismissal;
