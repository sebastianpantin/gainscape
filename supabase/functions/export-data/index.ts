import { authenticatedUserId } from '../_shared/auth.ts';
import { sql } from '../_shared/db.ts';
import { HttpError, jsonResponse } from '../_shared/http.ts';
import { takeRateLimit } from '../_shared/rate-limit.ts';
import { serve } from '../_shared/serve.ts';

const EXPORT_FORMAT_VERSION = 2;

async function exportFor(userId: string) {
  await takeRateLimit(sql, 'export_data_hour', userId);
  return await sql.begin('read only', async (tx) => {
    const [account] = await tx`select email, created_at from auth.users where id = ${userId}`;
    const [profile] = await tx`
      select username, display_name, bio, training_focus, training_since, badge_color, show_weights, show_bodyweight,
             created_at, updated_at
      from public.profiles where id = ${userId}`;
    if (!profile) throw new HttpError(404, 'profile_not_found');
    const [privateProfile] = await tx`
      select bodyweight_kg::float, height_cm::float, birth_year, unit_pref, effort_input_mode, timezone,
             timezone_changed_at, created_at, updated_at
      from public.profile_private where user_id = ${userId}`;
    const sessions = await tx`select * from public.sessions where user_id = ${userId} order by started_at, id`;
    const sets = await tx`select * from public.sets where user_id = ${userId} order by session_id, position`;
    const deletedSessions = await tx`
      select id, started_at, deleted_at from public.deleted_sessions where user_id = ${userId} order by deleted_at`;
    const setSkillXp = await tx`
      select x.set_id, s.key as skill, x.xp
      from public.set_skill_xp x join public.skills s on s.id = x.skill_id
      where x.user_id = ${userId} order by x.set_id, s.sort_order`;
    const skills = await tx`
      select s.key as skill, u.xp
      from public.user_skills u join public.skills s on s.id = u.skill_id
      where u.user_id = ${userId} order by s.sort_order`;
    const exerciseMaxes = await tx`select * from public.exercise_maxes where user_id = ${userId}`;
    const repMaxes = await tx`select * from public.rep_maxes where user_id = ${userId} order by exercise_id, reps`;
    const bodyweightRepRecords = await tx`select * from public.bodyweight_rep_records where user_id = ${userId}`;
    const cardioRecords = await tx`
      select * from public.cardio_records where user_id = ${userId} order by exercise_id, kind`;
    const pinnedExercises = await tx`select * from public.pinned_exercises where user_id = ${userId} order by position`;
    const customExercises = await tx`
      select e.*, coalesce(
        (select json_agg(json_build_object('skill', k.key, 'share_bp', es.share_bp) order by k.sort_order)
         from public.exercise_skills es join public.skills k on k.id = es.skill_id
         where es.exercise_id = e.id), '[]'::json) as shares
      from public.exercises e where e.owner_user_id = ${userId} order by e.created_at`;
    const programs = await tx`
      select p.*, coalesce(
        (select json_agg(json_build_object(
           'id', d.id, 'name', d.name, 'position', d.position,
           'exercises', coalesce(
             (select json_agg(to_jsonb(x) - 'day_id' order by x.position)
              from public.program_day_exercises x where x.day_id = d.id), '[]'::json))
         order by d.position)
         from public.program_days d where d.program_id = p.id), '[]'::json) as days
      from public.programs p where p.owner_user_id = ${userId} order by p.created_at`;
    const lootRolls = await tx`select * from public.loot_rolls where user_id = ${userId} order by created_at, id`;
    const drops = await tx`select * from public.drops where user_id = ${userId} order by created_at, id`;
    const dropLuck = await tx`select * from public.drop_luck where user_id = ${userId} order by drop_table_id`;
    const userItems = await tx`
      select * from public.user_items where user_id = ${userId} order by first_obtained_at, item_id`;
    const itemLedger = await tx`select * from public.item_ledger where user_id = ${userId} order by created_at, id`;
    const userUnlocks = await tx`
      select * from public.user_unlocks where user_id = ${userId} order by unlocked_at, exercise_id`;
    const crafts = await tx`select * from public.crafts where user_id = ${userId} order by created_at, id`;
    const events = await tx`select * from public.events where user_id = ${userId} order by occurred_at, id`;
    const friendships = await tx`
      select case when f.requester_id = ${userId} then f.addressee_id else f.requester_id end as "otherUserId",
             p.username as "otherUsername",
             case when f.requester_id = ${userId} then 'outgoing' else 'incoming' end as direction,
             case when f.requester_id = ${userId} and f.status = 'declined' then 'pending' else f.status::text end
               as status,
             case when f.requester_id = ${userId} then f.requested_at else f.created_at end as "createdAt",
             case when f.requester_id = ${userId} and f.status = 'declined' then null else f.responded_at end
               as "respondedAt"
      from public.friendships f
      join public.profiles p on p.id = case when f.requester_id = ${userId} then f.addressee_id else f.requester_id end
      where ${userId} in (f.requester_id, f.addressee_id)
        and not (f.requester_id = ${userId} and f.withdrawn_at is not null)
      order by "createdAt", p.username`;
    const reactionsGiven = await tx`
      select event_id, created_at from public.reactions where user_id = ${userId} order by created_at, event_id`;

    return {
      format: 'gainscape-export',
      version: EXPORT_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      userId,
      account: { email: account?.email ?? null, createdAt: account?.created_at ?? null },
      profile,
      privateProfile,
      sessions,
      sets,
      deletedSessions,
      setSkillXp,
      skills,
      exerciseMaxes,
      repMaxes,
      bodyweightRepRecords,
      cardioRecords,
      pinnedExercises,
      customExercises,
      programs,
      lootRolls,
      drops,
      dropLuck,
      userItems,
      itemLedger,
      userUnlocks,
      crafts,
      events,
      friendships,
      reactionsGiven,
    };
  });
}

serve(async (request) => jsonResponse(await exportFor(await authenticatedUserId(request))));
