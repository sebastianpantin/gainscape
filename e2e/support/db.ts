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
