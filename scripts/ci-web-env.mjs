import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { localStackStatus } from './local-stack.ts';

const envPath = join(import.meta.dirname, '../web/.env.development.local');

const { PUBLISHABLE_KEY: publishableKey } = localStackStatus();
if (!publishableKey) {
  console.error('supabase status reported no PUBLISHABLE_KEY; is the stack running?');
  process.exit(1);
}
writeFileSync(envPath, `VITE_SUPABASE_PUBLISHABLE_KEY=${publishableKey}\n`);
console.log('Wrote web/.env.development.local with the stack publishable key.');
