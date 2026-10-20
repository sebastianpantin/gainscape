export const EXPORT_FORMAT_VERSION = 10;

export const EXPORT_SECTIONS = [
  'account',
  'profile',
  'privateProfile',
  'sessions',
  'sets',
  'deletedSessions',
  'setSkillXp',
  'skills',
  'exerciseMaxes',
  'repMaxes',
  'bodyweightRepRecords',
  'cardioRecords',
  'bodyweightEntries',
  'pinnedExercises',
  'exerciseNotes',
  'weeklyGoals',
  'liftGoals',
  'customExercises',
  'programs',
  'programTemplates',
  'programEnrollments',
  'programEnrollmentEvents',
  'lootRolls',
  'drops',
  'dropLuck',
  'userItems',
  'itemLedger',
  'userLoadout',
  'crafts',
  'quests',
  'events',
  'friendships',
  'reactionsGiven',
] as const;

export type ExportSections = Record<(typeof EXPORT_SECTIONS)[number], unknown>;

export function exportDocument(userId: string, exportedAt: string, sections: ExportSections) {
  return {
    format: 'gainscape-export',
    version: EXPORT_FORMAT_VERSION,
    exportedAt,
    userId,
    ...Object.fromEntries(EXPORT_SECTIONS.map((section) => [section, sections[section]])),
  };
}
