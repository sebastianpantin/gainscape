export const APP_TITLE = 'Gainscape';

const PARAMETER = ':';

const SCREEN_TITLES: readonly (readonly [pattern: string, screen: string])[] = [
  ['/', 'Train'],
  ['/reveal', 'Workout saved'],
  ['/skills', 'Skills'],
  ['/skills/quests', 'Quests'],
  ['/skills/body', 'Body'],
  ['/skills/:skillKey', 'Skill'],
  ['/collection', 'Collection'],
  ['/collection/items', 'Items'],
  ['/collection/exercises/:exerciseId', 'Exercise progress'],
  ['/collection/history', 'History'],
  ['/collection/history/:sessionId', 'Workout'],
  ['/collection/stats', 'Stats'],
  ['/collection/stats/records', 'Records timeline'],
  ['/collection/stats/strength-level', 'Strength level'],
  ['/friends', 'Friends'],
  ['/friends/hiscores', 'Hiscores'],
  ['/friends/:friendId', 'Friend'],
  ['/profile', 'Profile'],
  ['/profile/edit', 'Edit profile'],
  ['/profile/preview', 'What friends see'],
  ['/profile/settings', 'Settings'],
  ['/profile/settings/whats-new', "What's new"],
  ['/exercises', 'Exercises'],
  ['/programs', 'Programs'],
  ['/programs/enroll/:key', 'Follow program'],
  ['/programs/active', 'Program'],
  ['/programs/active/plan', 'Program plan'],
  ['/programs/new', 'New program'],
  ['/programs/:programId', 'Edit program'],
  ['/design', 'Design'],
];

export const SCREEN_PATHS: readonly string[] = SCREEN_TITLES.map(([pattern]) => pattern);

function segments(path: string): string[] {
  return path.split('/').filter((segment) => segment !== '');
}

function matches(pattern: string, pathSegments: readonly string[]): boolean {
  const patternSegments = segments(pattern);
  return (
    patternSegments.length === pathSegments.length &&
    patternSegments.every((segment, index) => segment.startsWith(PARAMETER) || segment === pathSegments[index])
  );
}

export function routeTitle(pathname: string): string {
  const pathSegments = segments(pathname);
  const exact = SCREEN_TITLES.find(([pattern]) => !pattern.includes(PARAMETER) && matches(pattern, pathSegments));
  const screen = exact ?? SCREEN_TITLES.find(([pattern]) => matches(pattern, pathSegments));
  return screen ? `${screen[1]} · ${APP_TITLE}` : APP_TITLE;
}
