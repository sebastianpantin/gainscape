import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const envPath = join(import.meta.dirname, '../web/.env.development.local');

const output = execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
});
const { ANON_KEY: anonKey } = JSON.parse(output.slice(output.indexOf('{')));
if (!anonKey) {
  console.error('supabase status reported no ANON_KEY; is the stack running?');
  process.exit(1);
}
writeFileSync(envPath, `VITE_SUPABASE_ANON_KEY=${anonKey}\n`);
console.log('Wrote web/.env.development.local with the stack anon key.');
