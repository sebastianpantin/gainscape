import { db } from '../../tests/integration/local-stack.ts';

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

export async function sessionNotes(sessionId: string): Promise<string | null> {
  const [row] = await db`select notes from public.sessions where id = ${sessionId}`;
  return row?.notes ?? null;
}
