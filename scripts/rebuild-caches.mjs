import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';

const stackEnvPath = join(import.meta.dirname, '../.stack.env');
if (existsSync(stackEnvPath)) {
  const expected = /^SUPABASE_PROJECT_ID=(.*)$/m.exec(readFileSync(stackEnvPath, 'utf8'))?.[1]?.trim();
  if (expected && process.env.SUPABASE_PROJECT_ID !== expected) {
    console.error(
      `.stack.env sets SUPABASE_PROJECT_ID=${expected} but the environment has ${process.env.SUPABASE_PROJECT_ID ?? 'none'}; ` +
        'run through make, or `set -a; . ./.stack.env; set +a` first',
    );
    process.exit(1);
  }
}

const statusOutput = execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
});
const localStack = JSON.parse(statusOutput.slice(statusOutput.indexOf('{')));
const db = postgres(localStack.DB_URL, { max: 1, onnotice: () => {} });

const users = await db`select id from public.profiles order by created_at`;
await db.end();

for (const { id } of users) {
  const response = await fetch(`${localStack.FUNCTIONS_URL}/rebuild-caches`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${localStack.SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
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
