import { xpForLevel } from '@domain/index.ts';
import { describe, expect, it } from 'vitest';
import type { Skill } from '../../web/src/lib/catalog-rules.ts';
import { cardProfileOf, standingOfView } from '../../web/src/lib/profile-view.ts';
import type { ProfileView } from '../../web/src/lib/social.ts';

const view: ProfileView = {
  userId: '11111111-1111-4111-8111-111111111111',
  username: 'iron_otter',
  displayName: 'Iron Otter',
  bio: 'Squats daily',
  trainingFocus: 'strength',
  trainingSince: 2019,
  badgeColor: 'blue',
  joinedAt: '2026-09-01T10:00:00.000Z',
  showWeights: true,
  relation: 'friend',
  friendsSince: '2026-09-10T10:00:00.000Z',
  skillXp: { legs: xpForLevel(12) },
  collection: { filledSlots: 3, totalSlots: 10 },
};

const skills: Skill[] = [
  { id: 'chest-id', key: 'chest', name: 'Chest', sortOrder: 1, combatWeight: 1, modality: 'lift' },
  { id: 'legs-id', key: 'legs', name: 'Legs', sortOrder: 2, combatWeight: 1, modality: 'lift' },
];

describe('cardProfileOf', () => {
  it('keeps the card fields and shows the join date as the creation date', () => {
    expect(cardProfileOf(view)).toEqual({
      username: 'iron_otter',
      displayName: 'Iron Otter',
      bio: 'Squats daily',
      trainingFocus: 'strength',
      trainingSince: 2019,
      badgeColor: 'blue',
      createdAt: '2026-09-01T10:00:00.000Z',
    });
  });
});

describe('standingOfView', () => {
  it('reads skill XP by skill key and treats missing skills as zero', () => {
    const standing = standingOfView(skills, view);
    expect(standing.skills.map(({ skill, progress }) => [skill.key, progress.xp])).toEqual([
      ['chest', 0],
      ['legs', xpForLevel(12)],
    ]);
    expect(standing.skills[1].progress.level).toBe(12);
  });
});
