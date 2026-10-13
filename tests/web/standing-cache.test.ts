import { describe, expect, it } from 'vitest';
import { MODALITIES } from '../../web/src/lib/exercises/catalog-rules.ts';
import { type SavedStanding, standingCache } from '../../web/src/offline/standing-cache.ts';
import { MemoryStorage } from './memory-storage.ts';

const USER_ID = '11111111-1111-4111-8111-111111111111';

const SAVED: SavedStanding = {
  skills: [
    { id: 'skill-chest', key: 'chest', name: 'Chest', sortOrder: 1, combatWeight: 1, modality: 'lift' },
    { id: 'skill-cardio', key: 'cardio', name: 'Cardio', sortOrder: 7, combatWeight: 0, modality: 'cardio' },
  ],
  xpBySkillId: { 'skill-chest': 1250 },
};

describe('saved skills standing', () => {
  it('reads back the saved skills and their XP for the same user', () => {
    const storage = new MemoryStorage();
    standingCache.save(storage, USER_ID, SAVED);
    expect(standingCache.read(storage, USER_ID)).toEqual(SAVED);
  });

  it('ignores a saved skill with an unknown modality', () => {
    const storage = new MemoryStorage();
    standingCache.save(storage, USER_ID, {
      ...SAVED,
      skills: [{ ...SAVED.skills[0]!, modality: 'swim' as 'lift' }],
    });
    expect(standingCache.read(storage, USER_ID)).toBeNull();
  });

  it('accepts a skill of every modality the app knows', () => {
    const storage = new MemoryStorage();
    const skills = MODALITIES.map((modality, index) => ({ ...SAVED.skills[0]!, id: `skill-${index}`, modality }));
    standingCache.save(storage, USER_ID, { skills, xpBySkillId: {} });
    expect(standingCache.read(storage, USER_ID)?.skills).toEqual(skills);
  });
});
