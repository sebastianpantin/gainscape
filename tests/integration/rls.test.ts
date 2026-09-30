import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anon, builtInExerciseId, createTestUser, db, postCompleteSession, type TestUser } from './local-stack.ts';

let owner: TestUser;
let stranger: TestUser;
let ownerSessionId: string;
let benchId: string;

beforeAll(async () => {
  owner = await createTestUser();
  stranger = await createTestUser();
  benchId = await builtInExerciseId('barbell_bench_press');
  ownerSessionId = randomUUID();
  const endedAt = new Date();
  const response = await postCompleteSession(owner.accessToken, {
    id: ownerSessionId,
    startedAt: new Date(endedAt.getTime() - 30 * 60 * 1000).toISOString(),
    endedAt: endedAt.toISOString(),
    sets: [
      {
        id: randomUUID(),
        exerciseId: benchId,
        position: 0,
        weightKg: 60,
        reps: 8,
        effort: { type: 'level', level: 'hard' },
      },
    ],
  });
  expect(response.status).toBe(200);
});

afterAll(async () => {
  await db.end();
});

describe('game tables reject client writes', () => {
  it.each(['sessions', 'sets', 'set_skill_xp', 'user_skills'])('insert into %s is denied', async (table) => {
    const rowsByTable: Record<string, object> = {
      sessions: {
        id: randomUUID(),
        user_id: owner.id,
        started_at: new Date().toISOString(),
        ended_at: new Date().toISOString(),
        local_date: '2026-09-28',
        timezone: 'UTC',
        balance_version: 1,
        summary: {},
      },
      sets: {
        id: randomUUID(),
        session_id: ownerSessionId,
        user_id: owner.id,
        exercise_id: benchId,
        position: 99,
        weight_kg: 1,
        effective_load_kg: 1,
        reps: 1,
        rir: 0,
        rir_source: 'logged',
        effective_reps: 1,
        xp_awarded: 999,
      },
      set_skill_xp: { set_id: randomUUID(), skill_id: randomUUID(), user_id: owner.id, xp: 999 },
      user_skills: { user_id: owner.id, skill_id: randomUUID(), xp: 13_034_431 },
    };
    const { error } = await owner.client.from(table).insert(rowsByTable[table]);
    expect(error).not.toBeNull();
  });

  it('update of user_skills xp is denied', async () => {
    await owner.client.from('user_skills').update({ xp: 13_034_431 }).eq('user_id', owner.id);
    const [row] = await db`select max(xp)::int as xp from public.user_skills where user_id = ${owner.id}`;
    expect(row.xp).toBeLessThan(13_034_431);
  });
});

describe('users only see their own data', () => {
  it("hides another user's sets", async () => {
    const { data, error } = await stranger.client.from('sets').select('id').eq('user_id', owner.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("hides another user's private profile", async () => {
    const { data, error } = await stranger.client.from('profile_private').select('*').eq('user_id', owner.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('shows the owner their own sets', async () => {
    const { data } = await owner.client.from('sets').select('id');
    expect(data).toHaveLength(1);
  });
});

describe('profile protections', () => {
  it('rejects changing your own username', async () => {
    const { error } = await owner.client.from('profiles').update({ username: 'renamed_user' }).eq('id', owner.id);
    expect(error).not.toBeNull();
    const [row] = await db`select username from public.profiles where id = ${owner.id}`;
    expect(row.username).toBe(owner.username);
  });

  it('allows changing your display name', async () => {
    const { error } = await owner.client.from('profiles').update({ display_name: 'Iron Owner' }).eq('id', owner.id);
    expect(error).toBeNull();
  });
});

describe('function execution rights', () => {
  it('lets anonymous visitors check username availability', async () => {
    const { data, error } = await anon.rpc('username_available', { candidate: 'nobody_has_this' });
    expect(error).toBeNull();
    expect(data).toBe(true);
  });

  it('reports taken usernames as unavailable', async () => {
    const { data } = await anon.rpc('username_available', { candidate: owner.username });
    expect(data).toBe(false);
  });

  it('revokes default privileges so future public objects are not auto-granted', async () => {
    const rows = await db`
      select defaclobjtype as object_type, defaclacl::text as acl
      from pg_default_acl a join pg_namespace n on n.oid = a.defaclnamespace
      join pg_roles r on r.oid = a.defaclrole
      where n.nspname = 'public' and r.rolname = 'postgres'`;
    for (const row of rows) {
      expect(row.acl, `default ACL for ${row.object_type}`).not.toMatch(/(^|[{,])(anon|authenticated)=/);
    }
  });

  it('grants anon execute on username_available only', async () => {
    const rows = await db`
      select n.nspname || '.' || p.proname as name
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private') and has_function_privilege('anon', p.oid, 'execute')`;
    expect(rows.map((row) => row.name)).toEqual(['public.username_available']);
  });
});
