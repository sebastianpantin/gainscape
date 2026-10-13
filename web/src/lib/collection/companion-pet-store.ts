import { z } from 'zod';
import { userCache } from '../../offline/cache-first.ts';

export const companionPetStore = userCache<string>('gainscape.companion-pet.v1.', z.string());
