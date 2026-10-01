import { execFileSync } from 'node:child_process';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

const output = execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
});
const { DB_URL: dbUrl } = JSON.parse(output.slice(output.indexOf('{')));
const host = dbUrl ? new URL(dbUrl).hostname : null;

if (!host || !LOCAL_HOSTS.has(host)) {
  console.error(`Refusing to run pgTAP: the database host is ${host ?? 'unknown'}, not the local stack.`);
  process.exit(1);
}
if (process.env.SUPABASE_DB_URL || process.env.DATABASE_URL) {
  console.error('Refusing to run pgTAP while SUPABASE_DB_URL or DATABASE_URL is set; it only runs on the local stack.');
  process.exit(1);
}
