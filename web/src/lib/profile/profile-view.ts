import type { Skill } from '../exercises/catalog-rules.ts';
import type { Profile } from './profile-rules.ts';
import type { ProfileView } from '../social/social.ts';
import { type Standing, standingFrom } from '../progress/standing-rules.ts';

export type CardProfile = Pick<
  Profile,
  'username' | 'displayName' | 'bio' | 'trainingFocus' | 'trainingSince' | 'badgeColor' | 'createdAt'
>;

export function cardProfileOf(view: ProfileView): CardProfile {
  return {
    username: view.username,
    displayName: view.displayName,
    bio: view.bio,
    trainingFocus: view.trainingFocus,
    trainingSince: view.trainingSince,
    badgeColor: view.badgeColor,
    createdAt: view.joinedAt,
  };
}

export function standingOfView(skills: Skill[], view: ProfileView): Standing {
  return standingFrom(skills, new Map(skills.map((skill) => [skill.id, view.skillXp[skill.key] ?? 0])));
}
