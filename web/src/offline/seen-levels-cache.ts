import { z } from 'zod';
import { userCache } from './cache-first.ts';

export interface SeenLevels {
  totalLevel: number;
  combatLevel: number;
}

const seenLevelsSchema = z.object({ totalLevel: z.number(), combatLevel: z.number() });

export const seenLevelsCache = userCache<SeenLevels>('gainscape.seen-levels.v1.', seenLevelsSchema);
