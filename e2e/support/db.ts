import { admin, db } from '../../tests/integration/local-stack.ts';

export { builtInExerciseId, resignedWithAnotherKey } from '../../tests/integration/local-stack.ts';

export async function sessionCount(username: string): Promise<number> {
  const [row] = await db`
    select count(*)::int as count
    from public.sessions s join public.profiles p on p.id = s.user_id
    where p.username = ${username}`;
  return row.count;
}

export async function sessionRow(id: string) {
  const [row] = await db`select * from public.sessions where id = ${id}`;
  return row ?? null;
}

export async function programDayId(username: string, programName: string, dayName: string): Promise<string> {
  const [row] = await db`
    select d.id from public.program_days d
    join public.programs p on p.id = d.program_id
    join public.profiles u on u.id = p.owner_user_id
    where u.username = ${username} and p.name = ${programName} and d.name = ${dayName}`;
  return row.id;
}

export async function setCount(sessionId: string): Promise<number> {
  const [row] = await db`select count(*)::int as count from public.sets where session_id = ${sessionId}`;
  return row.count;
}

export async function latestSetOf(username: string) {
  const [row] = await db`
    select s.weight_kg::float as weight_kg, s.reps, s.rir::float as rir, s.effort_input_type, s.effort_value::float
    from public.sets s join public.profiles p on p.id = s.user_id
    where p.username = ${username}
    order by s.created_at desc, s.position desc
    limit 1`;
  return row ?? null;
}

export async function accountRowCount(username: string): Promise<number> {
  const [row] = await db`select count(*)::int as count from public.profiles where username = ${username}`;
  return row.count;
}

export async function heightOf(username: string): Promise<number | null> {
  const [row] = await db`
    select pp.height_cm::float as height_cm
    from public.profile_private pp join public.profiles p on p.id = pp.user_id
    where p.username = ${username}`;
  return row?.height_cm ?? null;
}

export async function editElsewhere(sessionId: string, reps: number): Promise<void> {
  await db`update public.sets set reps = ${reps} where session_id = ${sessionId}`;
  await db`update public.sessions set revision = revision + 1, notes = 'edited elsewhere' where id = ${sessionId}`;
}

export async function setsOf(sessionId: string) {
  return db`
    select reps, effort_input_type, effort_value::float as effort_value
    from public.sets where session_id = ${sessionId} order by position`;
}

export async function boutsOf(sessionId: string) {
  return db`
    select duration_s, distance_m::float as distance_m, interval_rounds, effort_value::float as effort_value
    from public.sets where session_id = ${sessionId} and duration_s is not null order by position`;
}

export async function sessionNotes(sessionId: string): Promise<string | null> {
  const [row] = await db`select notes from public.sessions where id = ${sessionId}`;
  return row?.notes ?? null;
}

export async function activeDropsOfLatestSession(username: string) {
  return db`
    select i.name, d.quantity, d.source
    from public.drops d
    join public.items i on i.id = d.item_id
    join public.profiles p on p.id = d.user_id
    where p.username = ${username} and d.revoked_at is null
      and d.session_id = (
        select s.id from public.sessions s where s.user_id = p.id order by s.started_at desc limit 1)
    order by d.created_at, d.id`;
}

export async function grantItems(username: string, holdings: Record<string, number>): Promise<void> {
  await db.begin(async (tx) => {
    const [profile] = await tx`select id from public.profiles where username = ${username}`;
    for (const [key, quantity] of Object.entries(holdings)) {
      const [item] = await tx`
        select i.id, coalesce(u.quantity, 0)::int as held
        from public.items i
        left join public.user_items u on u.item_id = i.id and u.user_id = ${profile.id}
        where i.key = ${key}`;
      const delta = quantity - item.held;
      if (delta !== 0) {
        await tx`
          insert into public.item_ledger (user_id, item_id, delta, reason, ref_id)
          values (${profile.id}, ${item.id}, ${delta}, ${delta > 0 ? 'drop' : 'craft_out'}, gen_random_uuid())`;
      }
      await tx`
        insert into public.user_items (user_id, item_id, quantity) values (${profile.id}, ${item.id}, ${quantity})
        on conflict (user_id, item_id) do update set quantity = excluded.quantity, updated_at = now()`;
    }
  });
}

export async function grantUnlock(username: string, exerciseKey: string): Promise<void> {
  await db`
    insert into public.user_unlocks (user_id, exercise_id, item_id)
    select p.id, e.id, i.id
    from public.profiles p, public.exercises e join public.items i on i.grants_exercise_id = e.id
    where p.username = ${username} and e.key = ${exerciseKey}
    on conflict (user_id, exercise_id) do nothing`;
}

export async function activeDropCount(sessionId: string): Promise<number> {
  const [row] = await db`
    select count(*)::int as count from public.drops where session_id = ${sessionId} and revoked_at is null`;
  return row.count;
}

export async function hasUnlock(username: string, exerciseKey: string): Promise<boolean> {
  const [row] = await db`
    select count(*)::int as count
    from public.user_unlocks u
    join public.profiles p on p.id = u.user_id
    join public.exercises e on e.id = u.exercise_id
    where p.username = ${username} and e.key = ${exerciseKey}`;
  return row.count > 0;
}

export async function confirmAccount(email: string, accountPassword: string): Promise<void> {
  const [user] = await db`select id from auth.users where email = ${email}`;
  const confirmed = await admin.auth.admin.updateUserById(user.id, { email_confirm: true });
  if (confirmed.error) throw confirmed.error;
  const withPassword = await admin.auth.admin.updateUserById(user.id, { password: accountPassword });
  if (withPassword.error) throw withPassword.error;
}

export async function usernameOfEmail(email: string): Promise<string | null> {
  const [row] = await db`
    select p.username from public.profiles p join auth.users u on u.id = p.id where u.email = ${email}`;
  return row?.username ?? null;
}

export async function ageConfirmation(email: string, interval: string): Promise<void> {
  await db`update auth.users set email_confirmed_at = now() - ${interval}::interval where email = ${email}`;
}

export async function insertProgramTemplate(key: string, name: string, definition: unknown): Promise<void> {
  await db`
    insert into public.program_templates (key, version, name, definition)
    values (${key}, 1, ${name}, ${db.json(JSON.parse(JSON.stringify(definition)))})`;
}

export async function deleteProgramTemplate(key: string): Promise<void> {
  await db`delete from public.program_templates where key = ${key}`;
}

export async function activeEnrollmentOf(username: string) {
  const [row] = await db`
    select e.template_key, e.template_version, e.unit, e.options, e.lift_bindings, e.inputs, e.rounding
    from public.program_enrollments e join public.profiles p on p.id = e.user_id
    where p.username = ${username} and e.ended_at is null`;
  return row ?? null;
}

export async function exerciseIdOfKey(key: string): Promise<string> {
  const [row] = await db`select id from public.exercises where key = ${key} and owner_user_id is null`;
  return row.id;
}

export async function activeEnrollmentIdOf(username: string): Promise<string> {
  const [row] = await db`
    select e.id from public.program_enrollments e join public.profiles p on p.id = e.user_id
    where p.username = ${username} and e.ended_at is null`;
  return row.id;
}

export async function forgetSessionCreateLimits(username: string): Promise<void> {
  await db`
    delete from private.rate_limit_hits h using public.profiles p
    where p.id = h.subject and p.username = ${username} and h.bucket in ('session_create_hour', 'session_create_day')`;
}

export async function skipProgramDayElsewhere(
  enrollmentId: string,
  position: Record<string, string | number>,
): Promise<void> {
  await db`
    insert into public.program_enrollment_events (enrollment_id, kind, payload)
    values (${enrollmentId}, 'skip_day', ${db.json({ position })})`;
}

export async function programEventsOf(username: string) {
  return db`
    select v.kind, v.payload
    from public.program_enrollment_events v
    join public.program_enrollments e on e.id = v.enrollment_id
    join public.profiles p on p.id = e.user_id
    where p.username = ${username}
    order by v.effective_at, v.id`;
}

export async function warmupFlagsOfLatestSession(username: string) {
  return db`
    select s.is_warmup, s.xp_awarded::float as xp_awarded
    from public.sets s join public.profiles p on p.id = s.user_id
    where p.username = ${username}
      and s.session_id = (
        select s2.session_id from public.sets s2 where s2.user_id = p.id order by s2.created_at desc limit 1
      )
    order by s.position`;
}

export async function programPlanOf(username: string, programName: string) {
  return db`
    select d.name as day_name, x.key as exercise_key,
      e.target_sets, e.target_reps_min, e.target_reps_max
    from public.programs p
    join public.profiles u on u.id = p.owner_user_id
    join public.program_days d on d.program_id = p.id
    left join public.program_day_exercises e on e.day_id = d.id
    left join public.exercises x on x.id = e.exercise_id
    where u.username = ${username} and p.name = ${programName}
    order by d.position, e.position`;
}

export async function programCount(username: string): Promise<number> {
  const [row] = await db`
    select count(*)::int as count
    from public.programs p join public.profiles u on u.id = p.owner_user_id
    where u.username = ${username}`;
  return row.count;
}

export async function backdateWorkoutsOf(username: string, days: number): Promise<void> {
  await db`
    update public.sessions s
    set started_at = s.started_at - make_interval(days => ${days}),
        ended_at = s.ended_at - make_interval(days => ${days}),
        local_date = s.local_date - ${days}::int
    from public.profiles p
    where p.id = s.user_id and p.username = ${username}`;
}

export async function equipGear(username: string, itemKey: string): Promise<void> {
  await db`
    insert into public.user_loadout (user_id, slot, item_id)
    select p.id, i.gear_slot, i.id
    from public.profiles p, public.items i
    where p.username = ${username} and i.key = ${itemKey}
    on conflict (user_id, slot) do update set item_id = excluded.item_id`;
}
