import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { giveUserEverything, logOneSession, publicTablesOwnedByAUser, userRowCounts } from './account-support.ts';
import {
  anon,
  builtInExerciseId,
  createTestUser,
  db,
  postCompleteSession,
  rateLimitHits,
  seedRateLimitHits,
  setBodyweight,
  type TestUser,
} from './local-stack.ts';
import { linearFiveByFive, plannedDay, publishedProgram, savedProgram } from './program-support.ts';

const WIPED_TABLES = [
  'bodyweight_entries',
  'bodyweight_rep_records',
  'cardio_records',
  'crafts',
  'drop_luck',
  'drops',
  'events',
  'exercise_maxes',
  'exercise_notes',
  'item_ledger',
  'loot_rolls',
  'program_enrollments',
  'reactions',
  'rep_maxes',
  'sessions',
  'set_skill_xp',
  'sets',
  'user_items',
  'user_loadout',
  'user_skills',
  'weekly_goals',
];

const KEPT_TABLES = [
  'deleted_sessions',
  'exercises',
  'friendships',
  'pinned_exercises',
  'profile_private',
  'program_templates',
  'programs',
];

async function enrollInMadcow(user: TestUser): Promise<void> {
  const result = await user.client.rpc('enroll_program', {
    enrollment: {
      templateKey: 'madcow_5x5',
      templateVersion: 2,
      unit: 'kg',
      options: { rampStep: 0.125 },
      bindings: {
        squat: await builtInExerciseId('back_squat'),
        bench: await builtInExerciseId('barbell_bench_press'),
        row: await builtInExerciseId('barbell_row'),
        press: await builtInExerciseId('overhead_press'),
        deadlift: await builtInExerciseId('deadlift'),
        hyper: null,
      },
      inputs: {
        squat: { fiveRm: 100 },
        bench: { fiveRm: 80 },
        row: { fiveRm: 70 },
        press: { fiveRm: 50 },
        deadlift: { fiveRm: 140 },
      },
      rounding: { increment: 2.5, mode: 'nearest', barWeight: 20 },
    },
  });
  expect(result.error).toBeNull();
}

async function publishCustomTemplate(user: TestUser): Promise<void> {
  const programId = await savedProgram(user, {
    id: randomUUID(),
    name: 'Reset squat',
    days: [plannedDay('Day A', [linearFiveByFive(await builtInExerciseId('back_squat'))])],
  });
  await publishedProgram(user, programId);
}

async function publishedTemplateCount(userId: string): Promise<number> {
  const [row] = await db`select count(*)::int as count from public.program_templates where owner_user_id = ${userId}`;
  return row.count;
}

async function enrollmentCount(userId: string): Promise<number> {
  const [row] = await db`select count(*)::int as count from public.program_enrollments where user_id = ${userId}`;
  return row.count;
}

async function keptProfile(userId: string) {
  const [row] = await db`
    select p.username, p.display_name, p.bio, p.training_focus, p.badge_color,
           v.unit_pref, v.timezone, v.bodyweight_kg, v.height_cm
    from public.profiles p join public.profile_private v on v.user_id = p.id
    where p.id = ${userId}`;
  return row;
}

async function skillXp(userId: string) {
  return await db`select skill_id, xp from public.user_skills where user_id = ${userId} order by skill_id`;
}

function keptCounts(counts: Record<string, number>) {
  return Object.fromEntries(
    Object.entries(counts).filter(([table]) => !WIPED_TABLES.includes(table.split('.')[0] ?? table)),
  );
}

let owner: TestUser;
let bystander: TestUser;
let wipedSessionIds: string[] = [];

beforeAll(async () => {
  [owner, bystander] = await Promise.all([createTestUser(), createTestUser()]);
  await Promise.all([giveUserEverything(owner), giveUserEverything(bystander)]);
  for (const user of [owner, bystander]) {
    await enrollInMadcow(user);
    await publishCustomTemplate(user);
    const profile = await user.client
      .from('profiles')
      .update({ bio: 'Back again', training_focus: 'strength', badge_color: 'blue' })
      .eq('id', user.id);
    expect(profile.error).toBeNull();
    const privateProfile = await user.client
      .from('profile_private')
      .update({ unit_pref: 'lb', height_cm: 180 })
      .eq('user_id', user.id);
    expect(privateProfile.error).toBeNull();
  }
  const [ownerEvent] = await db`select id from public.events where user_id = ${owner.id} limit 1`;
  await db`insert into public.friendships (requester_id, addressee_id, status, responded_at)
           values (${bystander.id}, ${owner.id}, 'accepted', now())
           on conflict do nothing`;
  const gz = await bystander.client.rpc('set_gz', { event_id: ownerEvent.id, given: true });
  expect(gz.error).toBeNull();
});

afterAll(async () => {
  await db.end();
});

describe('reset_account_data coverage', () => {
  it('wipes or keeps every public table owned by a user, and names no table that is gone', async () => {
    const tables = await publicTablesOwnedByAUser();
    const classified = [...WIPED_TABLES, ...KEPT_TABLES];
    expect(tables.filter((table) => !classified.includes(table))).toEqual([]);
    expect(classified.filter((table) => !tables.includes(table))).toEqual([]);
  });
});

describe('reset_account_data', () => {
  it('needs a signed-in user', async () => {
    const { error } = await anon.rpc('reset_account_data', { confirmation: 'RESET' });
    expect(error).not.toBeNull();
  });

  it('refuses without the typed confirmation and changes nothing', async () => {
    const before = await userRowCounts(owner.id);
    for (const confirmation of ['reset', 'RESET ', '']) {
      const { error } = await owner.client.rpc('reset_account_data', { confirmation });
      expect(error?.message, confirmation).toBe('confirmation_mismatch');
    }
    expect(await userRowCounts(owner.id)).toEqual(before);
  });

  it('takes no user id, so a caller cannot point it at someone else', async () => {
    const before = await userRowCounts(bystander.id);
    for (const target of [{ user_id: bystander.id }, { target: bystander.id }, { caller: bystander.id }]) {
      const { error } = await owner.client.rpc('reset_account_data', { confirmation: 'RESET', ...target });
      expect(error, JSON.stringify(target)).not.toBeNull();
    }
    expect(await userRowCounts(bystander.id)).toEqual(before);
    expect(await rateLimitHits('reset_account_hour', owner.id)).toBe(0);
  });

  it('refuses once the hourly limit is spent', async () => {
    const limited = await createTestUser();
    await seedRateLimitHits('reset_account_hour', limited.id, 5);
    const { error } = await limited.client.rpc('reset_account_data', { confirmation: 'RESET' });
    expect(error?.code).toBe('PT429');
    expect(await rateLimitHits('reset_account_hour', limited.id)).toBe(5);
  });

  it("wipes the caller's progress, keeps the account, profile, friends and custom library, and leaves others alone", async () => {
    const ownerBefore = await userRowCounts(owner.id);
    for (const table of WIPED_TABLES.filter((name) => name in ownerBefore && name !== 'bodyweight_rep_records'))
      expect(ownerBefore[table], table).toBeGreaterThan(0);
    expect(await enrollmentCount(owner.id)).toBe(1);
    const profileBefore = await keptProfile(owner.id);
    const templatesBefore = await publishedTemplateCount(owner.id);
    expect(templatesBefore).toBe(1);
    const bystanderReactionsBefore = (await userRowCounts(bystander.id)).reactions;
    const bystanderBefore = await userRowCounts(bystander.id);

    wipedSessionIds = (await db`select id from public.sessions where user_id = ${owner.id}`).map((row) => row.id);
    const tombstonesBefore = ownerBefore.deleted_sessions;

    const { error } = await owner.client.rpc('reset_account_data', { confirmation: 'RESET' });
    expect(error).toBeNull();

    const ownerAfter = await userRowCounts(owner.id);
    for (const table of WIPED_TABLES.filter((name) => name in ownerAfter)) expect(ownerAfter[table], table).toBe(0);
    expect(await enrollmentCount(owner.id)).toBe(0);
    expect(ownerAfter.deleted_sessions).toBe(tombstonesBefore + wipedSessionIds.length);
    expect(keptCounts({ ...ownerAfter, deleted_sessions: 0 })).toEqual(
      keptCounts({ ...ownerBefore, deleted_sessions: 0 }),
    );
    expect(ownerAfter['friendships.requester_id'] + ownerAfter['friendships.addressee_id']).toBe(3);
    expect(await publishedTemplateCount(owner.id)).toBe(templatesBefore);
    expect(await keptProfile(owner.id)).toEqual(profileBefore);
    expect(await rateLimitHits('reset_account_hour', owner.id)).toBe(1);

    const bystanderAfter = await userRowCounts(bystander.id);
    expect(bystanderAfter.reactions).toBe(bystanderReactionsBefore - 1);
    expect({ ...bystanderAfter, reactions: 0 }).toEqual({ ...bystanderBefore, reactions: 0 });
  });

  it('refuses a workout from before the reset that a stale device sends again', async () => {
    const response = await postCompleteSession(owner.accessToken, {
      id: wipedSessionIds[0],
      startedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      endedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      sets: [
        {
          id: randomUUID(),
          exerciseId: await builtInExerciseId('barbell_bench_press'),
          position: 0,
          weightKg: 60,
          reps: 5,
          effort: { type: 'rpe', value: 8 },
        },
      ],
    });
    expect(response.status, response.rawBody).toBe(410);
    expect(response.body).toMatchObject({ error: 'session_deleted' });
  });

  it('lets the caller start over with the same XP a brand-new account earns', async () => {
    const newcomer = await createTestUser();
    await setBodyweight(newcomer, 82);
    await logOneSession(owner);
    await logOneSession(newcomer);
    expect(await skillXp(owner.id)).toEqual(await skillXp(newcomer.id));
  });
});
