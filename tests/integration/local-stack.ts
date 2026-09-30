import { execFileSync } from 'node:child_process';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
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

function readLocalStackEnv(): LocalStackEnv {
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

export async function postCompleteSession(accessToken: string, payload: unknown): Promise<FunctionResponse> {
  const response = await fetch(`${env.FUNCTIONS_URL}/complete-session`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, apikey: env.ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const rawBody = await response.text();
  return { status: response.status, body: JSON.parse(rawBody), rawBody };
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
