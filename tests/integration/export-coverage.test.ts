import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { EXPORT_SECTIONS } from '../../supabase/functions/export-data/format.ts';
import { builtInExerciseId, createTestUser, db, postFunction } from './local-stack.ts';
import { linearFiveByFive, plannedDay, publishedProgram, savedProgram } from './program-support.ts';

const SECTION_OF_USER_TABLE: Record<string, string> = {
  bodyweight_entries: 'bodyweightEntries',
  bodyweight_rep_records: 'bodyweightRepRecords',
  cardio_records: 'cardioRecords',
  crafts: 'crafts',
  deleted_sessions: 'deletedSessions',
  drop_luck: 'dropLuck',
  drops: 'drops',
  events: 'events',
  exercise_maxes: 'exerciseMaxes',
  exercise_notes: 'exerciseNotes',
  exercises: 'customExercises',
  item_ledger: 'itemLedger',
  loot_rolls: 'lootRolls',
  pinned_exercises: 'pinnedExercises',
  profile_private: 'privateProfile',
  program_enrollments: 'programEnrollments',
  program_templates: 'programTemplates',
  programs: 'programs',
  reactions: 'reactionsGiven',
  rep_maxes: 'repMaxes',
  sessions: 'sessions',
  set_skill_xp: 'setSkillXp',
  sets: 'sets',
  user_items: 'userItems',
  user_loadout: 'userLoadout',
  user_skills: 'skills',
  weekly_goals: 'weeklyGoals',
};

const NOT_EXPORTED_USER_TABLES: Record<string, string> = {};

afterAll(async () => {
  await db.end();
});

async function publicTablesOwnedByAUser(): Promise<string[]> {
  const rows = await db`
    select distinct table_name::text as table_name
    from information_schema.columns
    where table_schema = 'public' and column_name in ('user_id', 'owner_user_id')
    order by 1`;
  return rows.map((row) => row.table_name as string);
}

describe('export-data coverage', () => {
  it('exports every public table that has a user_id or owner_user_id column, or names why not', async () => {
    const tables = await publicTablesOwnedByAUser();
    const uncovered = tables.filter(
      (table) =>
        !(table in NOT_EXPORTED_USER_TABLES) &&
        !(EXPORT_SECTIONS as readonly string[]).includes(SECTION_OF_USER_TABLE[table] ?? ''),
    );
    expect(uncovered).toEqual([]);
    const stale = [...Object.keys(SECTION_OF_USER_TABLE), ...Object.keys(NOT_EXPORTED_USER_TABLES)].filter(
      (table) => !tables.includes(table),
    );
    expect(stale).toEqual([]);
  });
});

interface ExportedTemplate {
  key: string;
  version: number;
  owner_user_id: string;
  source_program_id: string;
  definition: { key: string };
}

describe('export-data and custom program templates', () => {
  it("exports the caller's published program templates, and neither catalog nor another user's templates", async () => {
    const [owner, bystander] = await Promise.all([createTestUser(), createTestUser()]);
    const squatId = await builtInExerciseId('back_squat');
    const program = {
      id: randomUUID(),
      name: 'Exported squat',
      days: [plannedDay('Day A', [linearFiveByFive(squatId)])],
    };
    const programId = await savedProgram(owner, program);
    const first = await publishedProgram(owner, programId);
    await savedProgram(owner, { ...program, name: 'Exported squat v2' });
    const second = await publishedProgram(owner, programId);
    const bystanderProgramId = await savedProgram(bystander, {
      id: randomUUID(),
      name: 'Hidden squat',
      days: [plannedDay('Day A', [linearFiveByFive(squatId)])],
    });
    const bystanderTemplate = await publishedProgram(bystander, bystanderProgramId);

    const response = await postFunction('export-data', owner.accessToken, {});
    expect(response.status, response.rawBody).toBe(200);
    const templates = (response.body as unknown as { programTemplates: ExportedTemplate[] }).programTemplates;
    expect(templates.map((template) => [template.key, template.version])).toEqual([
      [first.key, first.version],
      [second.key, second.version],
    ]);
    expect(templates.every((template) => template.owner_user_id === owner.id)).toBe(true);
    expect(templates.every((template) => template.source_program_id === programId)).toBe(true);
    expect(templates[1].definition.key).toBe(second.key);
    expect(response.rawBody).not.toContain(bystanderTemplate.key);
    expect(response.rawBody).not.toContain(bystander.id);
  });
});
