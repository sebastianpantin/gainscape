import { z } from 'zod';
import { MODALITIES, type Skill } from '../lib/exercises/catalog-rules.ts';
import { userCache } from './cache-first.ts';

export const OFFLINE_SKILLS_NOTICE = 'Offline: using your saved skills.';

export interface SavedStanding {
  skills: Skill[];
  xpBySkillId: Record<string, number>;
}

const savedStandingSchema = z.object({
  skills: z.array(
    z.object({
      id: z.string(),
      key: z.string(),
      name: z.string(),
      sortOrder: z.number(),
      combatWeight: z.number(),
      modality: z.enum(MODALITIES),
    }),
  ),
  xpBySkillId: z.record(z.string(), z.number()),
});

export const standingCache = userCache<SavedStanding>('gainscape.standing.v1.', savedStandingSchema);
