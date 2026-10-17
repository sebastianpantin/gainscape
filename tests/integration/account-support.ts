import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import {
  builtInExerciseId,
  createTestUser,
  db,
  grantDrop,
  postCompleteSession,
  postFunction,
  type TestUser,
} from './local-stack.ts';
import { createCustomExercise } from './session-support.ts';

export const USER_TABLES: { table: string; column: string }[] = [
  { table: 'profiles', column: 'id' },
  { table: 'profile_private', column: 'user_id' },
  { table: 'sessions', column: 'user_id' },
  { table: 'sets', column: 'user_id' },
  { table: 'set_skill_xp', column: 'user_id' },
  { table: 'user_skills', column: 'user_id' },
  { table: 'exercise_maxes', column: 'user_id' },
  { table: 'rep_maxes', column: 'user_id' },
  { table: 'bodyweight_rep_records', column: 'user_id' },
  { table: 'cardio_records', column: 'user_id' },
  { table: 'bodyweight_entries', column: 'user_id' },
  { table: 'pinned_exercises', column: 'user_id' },
  { table: 'exercise_notes', column: 'user_id' },
  { table: 'weekly_goals', column: 'user_id' },
  { table: 'lift_goals', column: 'user_id' },
  { table: 'exercises', column: 'owner_user_id' },
  { table: 'programs', column: 'owner_user_id' },
  { table: 'deleted_sessions', column: 'user_id' },
  { table: 'loot_rolls', column: 'user_id' },
  { table: 'drops', column: 'user_id' },
  { table: 'drop_luck', column: 'user_id' },
  { table: 'user_items', column: 'user_id' },
  { table: 'item_ledger', column: 'user_id' },
  { table: 'user_loadout', column: 'user_id' },
  { table: 'events', column: 'user_id' },
  { table: 'friendships', column: 'requester_id' },
  { table: 'friendships', column: 'addressee_id' },
  { table: 'crafts', column: 'user_id' },
  { table: 'reactions', column: 'user_id' },
  { table: 'quest_progress', column: 'user_id' },
  { table: 'quest_completions', column: 'user_id' },
  { table: 'quest_completion_xp', column: 'user_id' },
];

export async function logOneSession(user: TestUser, weightKg = 60): Promise<string> {
  const sessionId = randomUUID();
  const endedAt = new Date();
  const response = await postCompleteSession(user.accessToken, {
    id: sessionId,
    startedAt: new Date(endedAt.getTime() - 30 * 60 * 1000).toISOString(),
    endedAt: endedAt.toISOString(),
    sets: [
      {
        id: randomUUID(),
        exerciseId: await builtInExerciseId('barbell_bench_press'),
        position: 0,
        weightKg,
        reps: 8,
        effort: { type: 'rpe', value: 8 },
      },
    ],
  });
  expect(response.status).toBe(200);
  return sessionId;
}

async function logRun(user: TestUser, hoursAgo: number, durationS: number): Promise<void> {
  const startedAt = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
  const response = await postCompleteSession(user.accessToken, {
    id: randomUUID(),
    startedAt: startedAt.toISOString(),
    endedAt: new Date(startedAt.getTime() + durationS * 1000).toISOString(),
    sets: [
      {
        kind: 'cardio',
        id: randomUUID(),
        exerciseId: await builtInExerciseId('running'),
        position: 0,
        durationS,
        distanceM: 5000,
        interval: null,
        effort: null,
      },
    ],
  });
  expect(response.status).toBe(200);
}

export async function giveUserEverything(user: TestUser): Promise<void> {
  await logRun(user, 6, 1800);
  const bodyweight = await user.client.from('profile_private').update({ bodyweight_kg: 82 }).eq('user_id', user.id);
  expect(bodyweight.error).toBeNull();
  const keptSessionId = await logOneSession(user);
  await logOneSession(user, 80);
  await grantDrop(user.id, keptSessionId, randomUUID(), 'scroll_pause_squat', 1, 'pr');
  await db`
    insert into public.drop_luck (user_id, drop_table_id, dry_rolls)
    select ${user.id}, id, 3 from public.drop_tables where key = 'regular'
    on conflict (user_id, drop_table_id) do nothing`;
  await grantDrop(user.id, keptSessionId, randomUUID(), 'rookie_belt', 1);
  await grantDrop(user.id, keptSessionId, randomUUID(), 'grinder_scraps', 8);
  const [recipe] = await db`select id from public.recipes where key = 'grinder_belt'`;
  const crafted = await user.client.rpc('craft', { recipe_id: recipe.id });
  expect(crafted.error).toBeNull();
  const equipped = await user.client.rpc('equip_gear', { slot: 'belt', item_id: crafted.data.itemId });
  expect(equipped.error).toBeNull();
  await db`
    insert into public.quest_progress (user_id, quest_id)
    select ${user.id}, id from public.quests where key = 'bench_mysteries'`;
  await db`
    insert into public.quest_completions
      (user_id, quest_id, started_at, session_id, anchor_started_at, anchor_session_id, quest_points)
    select ${user.id}, q.id, s.started_at, s.id, s.started_at, s.id, q.quest_points
    from public.quests q, public.sessions s where q.key = 'yogic_ritual' and s.id = ${keptSessionId}`;
  await db`
    insert into public.quest_completion_xp (user_id, quest_id, skill_id, xp)
    select ${user.id}, q.id, k.id, 600 from public.quests q, public.skills k
    where q.key = 'yogic_ritual' and k.key = 'mobility'`;
  const removed = await postFunction('delete-session', user.accessToken, { sessionId: await logOneSession(user) });
  expect(removed.status).toBe(200);
  const benchId = await builtInExerciseId('barbell_bench_press');
  const pin = await user.client.from('pinned_exercises').insert({ exercise_id: benchId, position: 0 });
  expect(pin.error).toBeNull();
  const note = await user.client.rpc('save_exercise_note', { exercise_id: benchId, body: 'Seat 4' });
  expect(note.error).toBeNull();
  const goal = await user.client.rpc('set_weekly_session_goal', { goal: 3 });
  expect(goal.error).toBeNull();
  const liftGoal = await user.client.rpc('save_lift_goal', {
    exercise_id: benchId,
    target_kg: 100,
    reps: 5,
    target_date: '2026-12-01',
  });
  expect(liftGoal.error).toBeNull();
  await createCustomExercise(user, { skillKey: 'shoulders' });
  const [template] = await db`select id from public.programs where owner_user_id is null limit 1`;
  const copy = await user.client.rpc('copy_program', { source_program_id: template.id, new_program_id: randomUUID() });
  expect(copy.error).toBeNull();
  const [requested, friend] = await Promise.all([createTestUser(), createTestUser()]);
  const outgoing = await user.client.rpc('send_friend_request', { username: requested.username });
  expect(outgoing.data).toMatchObject({ status: 'sent' });
  const incoming = await friend.client.rpc('send_friend_request', { username: user.username });
  expect(incoming.data).toMatchObject({ status: 'sent' });
  const accepted = await user.client.rpc('respond_friend_request', { requester_id: friend.id, accept: true });
  expect(accepted.data).toMatchObject({ status: 'accepted' });
  const friendSession = await logOneSession(friend);
  const [friendEvent] = await db`
    insert into public.events (user_id, session_id, event_key, type, occurred_at, payload)
    values (${friend.id}, ${friendSession}, 'level:back', 'level_up', now(), '{"skill": "back", "from": 9, "to": 10}')
    on conflict (session_id, event_key) do update set updated_at = now()
    returning id`;
  const gz = await user.client.rpc('set_gz', { event_id: friendEvent.id, given: true });
  expect(gz.data).toMatchObject({ gzCount: 1 });
}

export async function userRowCounts(userId: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const { table, column } of USER_TABLES) {
    const [row] = await db`select count(*)::int as count from ${db('public.' + table)} where ${db(column)} = ${userId}`;
    const shared = USER_TABLES.filter((entry) => entry.table === table).length > 1;
    counts[shared ? `${table}.${column}` : table] = row.count;
  }
  const [days] = await db`
    select count(*)::int as count from public.program_days d
    join public.programs p on p.id = d.program_id where p.owner_user_id = ${userId}`;
  const [dayExercises] = await db`
    select count(*)::int as count from public.program_day_exercises x
    join public.program_days d on d.id = x.day_id
    join public.programs p on p.id = d.program_id where p.owner_user_id = ${userId}`;
  counts.program_days = days.count;
  counts.program_day_exercises = dayExercises.count;
  return counts;
}

export async function publicTablesOwnedByAUser(): Promise<string[]> {
  const rows = await db`
    select table_name::text as table_name
    from information_schema.columns
    where table_schema = 'public' and column_name in ('user_id', 'owner_user_id')
    union
    select c.conrelid::regclass::text
    from pg_constraint c
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace and c.confrelid = 'public.profiles'::regclass
    order by 1`;
  return rows.map((row) => row.table_name as string);
}
