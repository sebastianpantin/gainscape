import postgres from 'postgres';
import { currentStackEnvMismatch, localStackStatus } from './local-stack.ts';

const mismatch = currentStackEnvMismatch();
if (mismatch) {
  console.error(mismatch);
  process.exit(1);
}

const localStack = localStackStatus();
const db = postgres(localStack.DB_URL, { max: 1, onnotice: () => {} });

const users = await db`select id from public.profiles order by created_at`;
await db.end();

for (const { id } of users) {
  const response = await fetch(`${localStack.FUNCTIONS_URL}/rebuild-caches`, {
    method: 'POST',
    headers: { apikey: localStack.SECRET_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: id }),
  });
  const result = await response.json();
  if (!response.ok) {
    console.error(`rebuild failed for ${id}:`, result);
    process.exit(1);
  }
  console.log(`rebuilt ${id}: ${result.sessionsReplayed} sessions, ${result.setsRewritten} sets`);
}
console.log(`Rebuilt ${users.length} users.`);
