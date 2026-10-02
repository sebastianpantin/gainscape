import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { lootSecretDecision, MIN_LOOT_SECRET_LENGTH } from './loot-secret.ts';

const envPath = join(import.meta.dirname, '../supabase/functions/.env.local');

const decision = lootSecretDecision(existsSync(envPath) ? readFileSync(envPath, 'utf8') : null);

if (decision === 'create') {
  writeFileSync(envPath, `LOOT_SECRET=${randomBytes(32).toString('hex')}\n`, { mode: 0o600 });
  console.log('Created supabase/functions/.env.local with a new LOOT_SECRET.');
} else if (decision === 'reject') {
  console.error(`supabase/functions/.env.local has no LOOT_SECRET of at least ${MIN_LOOT_SECRET_LENGTH} characters.`);
  process.exit(1);
}
