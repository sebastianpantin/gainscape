import postgres from 'postgres';
import { forEachConcurrently, retryEdgeRuntimeDrops } from './function-batch.ts';
import { currentStackEnvMismatch, localStackStatus } from './local-stack.ts';

const PARALLEL_REBUILDS = 8;
const EDGE_RUNTIME_RETRIES = 2;

const mismatch = currentStackEnvMismatch();
if (mismatch) {
  console.error(mismatch);
  process.exit(1);
}

const localStack = localStackStatus();
const db = postgres(localStack.DB_URL, { max: 1, onnotice: () => {} });

const users = await db`
  select p.id from public.profiles p
  where exists (select 1 from public.sessions s where s.user_id = p.id)
     or exists (select 1 from public.user_skills x where x.user_id = p.id)
     or exists (select 1 from public.exercise_maxes x where x.user_id = p.id)
     or exists (select 1 from public.rep_maxes x where x.user_id = p.id)
     or exists (select 1 from public.bodyweight_rep_records x where x.user_id = p.id)
     or exists (select 1 from public.cardio_records x where x.user_id = p.id)
  order by p.created_at`;
await db.end();

async function rebuild(userId) {
  const { status, rawBody } = await retryEdgeRuntimeDrops(
    async () => {
      const response = await fetch(`${localStack.FUNCTIONS_URL}/rebuild-caches`, {
        method: 'POST',
        headers: { apikey: localStack.SECRET_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      return { status: response.status, rawBody: await response.text() };
    },
    EDGE_RUNTIME_RETRIES,
    (dropped) => console.warn(`retrying ${userId}: the edge runtime dropped the request (${dropped.status})`),
  );
  if (status !== 200) throw new Error(`rebuild failed for ${userId}: ${status} ${rawBody}`);
  const result = JSON.parse(rawBody);
  console.log(`rebuilt ${userId}: ${result.sessionsReplayed} sessions, ${result.setsRewritten} sets`);
}

try {
  await forEachConcurrently(
    users.map(({ id }) => id),
    PARALLEL_REBUILDS,
    rebuild,
  );
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
console.log(`Rebuilt ${users.length} users with sessions or derived rows.`);
