import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const envPath = join(import.meta.dirname, '../supabase/functions/.env.local');
const MIN_SECRET_LENGTH = 32;

const existing = existsSync(envPath) ? readFileSync(envPath, 'utf8') : null;
const secret = existing === null ? null : /^LOOT_SECRET=(.*)$/m.exec(existing)?.[1]?.trim();

if (existing === null) {
  writeFileSync(envPath, `LOOT_SECRET=${randomBytes(32).toString('hex')}\n`, { mode: 0o600 });
  console.log('Created supabase/functions/.env.local with a new LOOT_SECRET.');
} else if (!secret || secret.length < MIN_SECRET_LENGTH) {
  console.error(`supabase/functions/.env.local has no LOOT_SECRET of at least ${MIN_SECRET_LENGTH} characters.`);
  process.exit(1);
}
