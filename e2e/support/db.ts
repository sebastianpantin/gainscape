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
