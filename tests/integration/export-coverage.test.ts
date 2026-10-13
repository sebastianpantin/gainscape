import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { EXPORT_SECTIONS } from '../../supabase/functions/export-data/format.ts';
import { publicTablesOwnedByAUser } from './account-support.ts';
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
  friendships: 'friendships',
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

const SECTION_OF_CHILD_TABLE: Record<string, string> = {
  exercise_skills: 'customExercises',
  program_day_exercises: 'programs',
  program_days: 'programs',
  program_enrollment_events: 'programEnrollmentEvents',
};

const NOT_EXPORTED_CHILD_TABLES: Record<string, string> = {};

afterAll(async () => {
  await db.end();
});

async function publicForeignKeys(): Promise<{ child: string; parent: string }[]> {
  const rows = await db`
    select distinct c.conrelid::regclass::text as child, c.confrelid::regclass::text as parent
    from pg_constraint c
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace and c.conrelid <> c.confrelid`;
  return rows.map((row) => ({ child: row.child as string, parent: row.parent as string }));
}

function tablesOwnedThroughAParent(owned: readonly string[], foreignKeys: { child: string; parent: string }[]) {
  const reached = new Set(owned);
  const children = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const { child, parent } of foreignKeys)
      if (reached.has(parent) && !reached.has(child)) {
        reached.add(child);
        children.add(child);
        grew = true;
      }
  }
  return [...children].sort();
}

function isExportSection(section: string | undefined): boolean {
  return (EXPORT_SECTIONS as readonly string[]).includes(section ?? '');
}

describe('export-data coverage', () => {
  it('exports every public table owned by a user column or a foreign key to profiles, or names why not', async () => {
    const tables = await publicTablesOwnedByAUser();
    const uncovered = tables.filter(
      (table) => !(table in NOT_EXPORTED_USER_TABLES) && !isExportSection(SECTION_OF_USER_TABLE[table]),
    );
    expect(uncovered).toEqual([]);
    const stale = [...Object.keys(SECTION_OF_USER_TABLE), ...Object.keys(NOT_EXPORTED_USER_TABLES)].filter(
      (table) => !tables.includes(table),
    );
    expect(stale).toEqual([]);
  });

  it('exports every table owned through a foreign key to a user-owned table, or names why not', async () => {
    const children = tablesOwnedThroughAParent(await publicTablesOwnedByAUser(), await publicForeignKeys());
    const uncovered = children.filter(
      (table) => !(table in NOT_EXPORTED_CHILD_TABLES) && !isExportSection(SECTION_OF_CHILD_TABLE[table]),
    );
    expect(uncovered).toEqual([]);
    const stale = [...Object.keys(SECTION_OF_CHILD_TABLE), ...Object.keys(NOT_EXPORTED_CHILD_TABLES)].filter(
      (table) => !children.includes(table),
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
    const otherProgramId = await savedProgram(owner, {
      id: randomUUID(),
      name: 'Exported squat two',
      days: [plannedDay('Day A', [linearFiveByFive(squatId)])],
    });
    const first = await publishedProgram(owner, programId);
    const second = await publishedProgram(owner, otherProgramId);
    const bystanderProgramId = await savedProgram(bystander, {
      id: randomUUID(),
      name: 'Hidden squat',
      days: [plannedDay('Day A', [linearFiveByFive(squatId)])],
    });
    const bystanderTemplate = await publishedProgram(bystander, bystanderProgramId);

    const response = await postFunction('export-data', owner.accessToken, {});
    expect(response.status, response.rawBody).toBe(200);
    const templates = (response.body as unknown as { programTemplates: ExportedTemplate[] }).programTemplates;
    const exported = templates.map((template) => [template.key, template.version, template.source_program_id]);
    expect(exported.sort()).toEqual(
      [
        [first.key, first.version, programId],
        [second.key, second.version, otherProgramId],
      ].sort(),
    );
    expect(templates.every((template) => template.owner_user_id === owner.id)).toBe(true);
    expect(templates.every((template) => template.definition.key === template.key)).toBe(true);
    expect(response.rawBody).not.toContain(bystanderTemplate.key);
    expect(response.rawBody).not.toContain(bystander.id);
  });
});
