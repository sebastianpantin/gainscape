import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { localStackStatus } from './local-stack.ts';

const envPath = join(import.meta.dirname, '../web/.env.development.local');

const { ANON_KEY: anonKey } = localStackStatus();
if (!anonKey) {
  console.error('supabase status reported no ANON_KEY; is the stack running?');
  process.exit(1);
}
writeFileSync(envPath, `VITE_SUPABASE_ANON_KEY=${anonKey}\n`);
console.log('Wrote web/.env.development.local with the stack anon key.');
