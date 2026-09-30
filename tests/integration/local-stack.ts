import { execFileSync } from 'node:child_process';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import type { Catalog, ExerciseDef, SessionSummary } from '@domain/index.ts';

interface LocalStackEnv {
  API_URL: string;
  DB_URL: string;
  FUNCTIONS_URL: string;
  ANON_KEY: string;
  SERVICE_ROLE_KEY: string;
}

const stackEnvPath = join(import.meta.dirname, '../../.stack.env');

function assertStackEnvLoaded(): void {
  if (!existsSync(stackEnvPath)) return;
  const expected = /^SUPABASE_PROJECT_ID=(.*)$/m.exec(readFileSync(stackEnvPath, 'utf8'))?.[1]?.trim();
  if (expected && process.env.SUPABASE_PROJECT_ID !== expected) {
    throw new Error(
      `.stack.env sets SUPABASE_PROJECT_ID=${expected} but the environment has ${process.env.SUPABASE_PROJECT_ID ?? 'none'}; ` +
        'run through make, or `set -a; . ./.stack.env; set +a` first, so tests never reach another stack',
    );
  }
}

function readLocalStackEnv(): LocalStackEnv {
  assertStackEnvLoaded();
  const output = execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return JSON.parse(output.slice(output.indexOf('{')));
}

export const env = readLocalStackEnv();
export const db = postgres(env.DB_URL, { max: 2, onnotice: () => {} });

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };
export const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, clientOptions);
export const anon = createClient(env.API_URL, env.ANON_KEY, clientOptions);

export interface TestUser {
  id: string;
  username: string;
  accessToken: string;
  client: SupabaseClient;
}

export async function createTestUser(timezone = 'Europe/Stockholm'): Promise<TestUser> {
  const username = `t_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  const email = `${username}@example.test`;
  const password = 'correct-horse-battery';
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username, timezone },
  });
  if (created.error) throw created.error;

  const client = createClient(env.API_URL, env.ANON_KEY, clientOptions);
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  return { id: created.data.user.id, username, accessToken: signedIn.data.session.access_token, client };
}

export async function builtInExerciseId(key: string): Promise<string> {
  const [row] = await db`select id from public.exercises where key = ${key}`;
  return row.id;
}

export interface FunctionResponseBody extends Partial<SessionSummary> {
  error?: string;
  details?: unknown;
}

export interface FunctionResponse {
  status: number;
  body: FunctionResponseBody;
  rawBody: string;
}

export async function postFunction(name: string, accessToken: string, body: unknown): Promise<FunctionResponse> {
  const response = await fetch(`${env.FUNCTIONS_URL}/${name}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, apikey: env.ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const rawBody = await response.text();
  return { status: response.status, body: JSON.parse(rawBody), rawBody };
}

export async function postCompleteSession(accessToken: string, payload: unknown): Promise<FunctionResponse> {
  return await postFunction('complete-session', accessToken, payload);
}

export async function rebuildCaches(userId: string, bearer = env.SERVICE_ROLE_KEY) {
  const response = await fetch(`${env.FUNCTIONS_URL}/rebuild-caches`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
  return { status: response.status, body: await response.json() };
}

export async function ageSession(sessionId: string, interval: string): Promise<string> {
  const [row] = await db`
    update public.sessions
    set started_at = date_trunc('milliseconds', now() - ${interval}::interval),
        ended_at = date_trunc('milliseconds', now() - ${interval}::interval) + (ended_at - started_at)
    where id = ${sessionId}
    returning started_at`;
  return new Date(row.started_at).toISOString();
}

export async function normalizedSnapshot(userId: string) {
  const sessions = await db`
    select id, summary, history_only, derived_balance_version
    from public.sessions where user_id = ${userId} order by started_at, id`;
  const sessionOrdinal = new Map(sessions.map((session, index) => [session.id as string, `s${index}`]));
  const setKeys = await db`select id, session_id, position from public.sets where user_id = ${userId}`;
  const setOrdinal = new Map(
    setKeys.map((row) => [row.id as string, `${sessionOrdinal.get(row.session_id)}.${row.position}`]),
  );
  const setRows = await db`
    select id, exercise_id, rir::float, rir_source, rir_flagged, e1rm_before_kg::float, e1rm_candidate_kg::float,
           reps_capacity_candidate, effective_reps, xp_awarded, effective_load_kg::float, weight_kg::float, reps,
           is_warmup
    from public.sets where user_id = ${userId}`;
  const customExercises =
    await db`select id from public.exercises where owner_user_id = ${userId} order by created_at, id`;
  const exerciseOrdinal = new Map(customExercises.map((row, index) => [row.id as string, `custom${index}`]));

  const set = (id: string | null) => (id === null ? null : (setOrdinal.get(id) ?? `foreign:${id}`));
  const exercise = (id: string) => exerciseOrdinal.get(id) ?? id;
  const byKey = <T extends Record<string, unknown>>(rows: T[], ...keys: string[]) =>
    [...rows].sort((a, b) => {
      for (const key of keys) {
        const [left, right] = [a[key], b[key]];
        const order =
          typeof left === 'number' && typeof right === 'number'
            ? left - right
            : String(left).localeCompare(String(right));
        if (order !== 0) return order;
      }
      return 0;
    });
  const summaryOf = (summary: Record<string, unknown>) => ({
    ...summary,
    ...(summary.sessionId === undefined ? {} : { sessionId: sessionOrdinal.get(summary.sessionId as string) }),
    ...(Array.isArray(summary.prs)
      ? { prs: summary.prs.map((pr) => ({ ...pr, exerciseId: exercise(pr.exerciseId) })) }
      : {}),
  });

  return {
    sessions: sessions.map((session) => ({
      session: sessionOrdinal.get(session.id),
      historyOnly: session.history_only,
      derivedBalanceVersion: session.derived_balance_version,
      summary: summaryOf(session.summary),
    })),
    sets: byKey(
      setRows.map(({ id, exercise_id, ...rest }) => ({
        set: set(id),
        exercise_id: exercise(exercise_id),
        ...rest,
      })),
      'set',
    ),
    setSkillXp: byKey(
      (await db`select set_id, skill_id, xp from public.set_skill_xp where user_id = ${userId}`).map((row) => ({
        set: set(row.set_id),
        skill_id: row.skill_id,
        xp: row.xp,
      })),
      'set',
      'skill_id',
    ),
    userSkills: await db`select skill_id, xp::int from public.user_skills where user_id = ${userId} order by skill_id`,
    exerciseMaxes: byKey(
      (
        await db`select exercise_id, e1rm_kg::float, reps_capacity, source_set_id
                 from public.exercise_maxes where user_id = ${userId}`
      ).map((row) => ({ ...row, exercise_id: exercise(row.exercise_id), source_set_id: set(row.source_set_id) })),
      'exercise_id',
    ),
    repMaxes: byKey(
      (
        await db`select exercise_id, reps, load_kg::float, set_id, achieved_at, exact_set_id
                 from public.rep_maxes where user_id = ${userId}`
      ).map((row) => ({
        ...row,
        exercise_id: exercise(row.exercise_id),
        set_id: set(row.set_id),
        exact_set_id: set(row.exact_set_id),
      })),
      'exercise_id',
      'reps',
    ),
    bodyweightRepRecords: byKey(
      (
        await db`select exercise_id, max_reps, set_id, achieved_at
                 from public.bodyweight_rep_records where user_id = ${userId}`
      ).map((row) => ({ ...row, exercise_id: exercise(row.exercise_id), set_id: set(row.set_id) })),
      'exercise_id',
    ),
  };
}

export async function domainCatalogFor(exerciseIds: string[]): Promise<Catalog> {
  const skillRows = await db`select id, key, sort_order, combat_weight from public.skills`;
  const shareRows = await db`
    select e.id, e.load_type, e.owner_user_id, es.skill_id, es.share_bp
    from public.exercises e join public.exercise_skills es on es.exercise_id = e.id
    where e.id = any(${exerciseIds}::uuid[])`;
  const exercises = new Map<string, ExerciseDef>();
  for (const row of shareRows) {
    const exercise: ExerciseDef = exercises.get(row.id) ?? {
      id: row.id,
      loadType: row.load_type,
      builtIn: row.owner_user_id === null,
      shares: [],
    };
    exercise.shares.push({ skillId: row.skill_id, shareBasisPoints: row.share_bp });
    exercises.set(row.id, exercise);
  }
  return {
    skills: skillRows.map((row) => ({
      id: row.id,
      key: row.key,
      sortOrder: row.sort_order,
      combatWeight: Number(row.combat_weight),
    })),
    exercises,
  };
}

export async function setBodyweight(user: TestUser, bodyweightKg: number): Promise<void> {
  const { error } = await user.client
    .from('profile_private')
    .update({ bodyweight_kg: bodyweightKg })
    .eq('user_id', user.id);
  if (error) throw error;
}

export function resignedWithAnotherKey(accessToken: string): string {
  const [, claims] = accessToken.split('.');
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const signature = createHmac('sha256', randomBytes(32)).update(`${header}.${claims}`).digest('base64url');
  return `${header}.${claims}.${signature}`;
}
