import { describe, expect, it } from 'vitest';
import {
  EXPORT_FORMAT_VERSION,
  EXPORT_SECTIONS,
  exportDocument,
  type ExportSections,
} from '../../supabase/functions/export-data/format.ts';

const V6_KEYS = [
  'format',
  'version',
  'exportedAt',
  'userId',
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
  'customExercises',
  'programs',
  'programEnrollments',
  'programEnrollmentEvents',
  'lootRolls',
  'drops',
  'dropLuck',
  'userItems',
  'itemLedger',
  'userLoadout',
  'crafts',
  'events',
  'friendships',
  'reactionsGiven',
];

const V7_KEYS = [
  ...V6_KEYS.slice(0, V6_KEYS.indexOf('programs') + 1),
  'programTemplates',
  ...V6_KEYS.slice(V6_KEYS.indexOf('programs') + 1),
];

const V8_KEYS = [
  ...V7_KEYS.slice(0, V7_KEYS.indexOf('crafts') + 1),
  'quests',
  ...V7_KEYS.slice(V7_KEYS.indexOf('crafts') + 1),
];

const V9_KEYS = [
  ...V8_KEYS.slice(0, V8_KEYS.indexOf('weeklyGoals') + 1),
  'liftGoals',
  ...V8_KEYS.slice(V8_KEYS.indexOf('weeklyGoals') + 1),
];

const TOP_LEVEL_KEYS_BY_VERSION: Record<number, readonly string[]> = {
  6: V6_KEYS,
  7: V7_KEYS,
  8: V8_KEYS,
  9: V9_KEYS,
  10: V9_KEYS,
};

describe('the data export format', () => {
  it('bumps EXPORT_FORMAT_VERSION whenever the top-level keys change', () => {
    const sections = Object.fromEntries(EXPORT_SECTIONS.map((section) => [section, []]));
    const document = exportDocument('user-1', '2026-10-09T08:00:00.000Z', sections as ExportSections);
    expect(TOP_LEVEL_KEYS_BY_VERSION[EXPORT_FORMAT_VERSION]).toEqual(Object.keys(document));
  });

  it('labels the document with its format, version, time and user', () => {
    const sections = Object.fromEntries(EXPORT_SECTIONS.map((section) => [section, null]));
    expect(exportDocument('user-1', '2026-10-09T08:00:00.000Z', sections as ExportSections)).toMatchObject({
      format: 'gainscape-export',
      version: EXPORT_FORMAT_VERSION,
      exportedAt: '2026-10-09T08:00:00.000Z',
      userId: 'user-1',
    });
  });
});
