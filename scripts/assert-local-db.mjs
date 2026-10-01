import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

function localDbUrl() {
  try {
    const output = execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return JSON.parse(output.slice(output.indexOf('{'))).DB_URL ?? null;
  } catch {
    return null;
  }
}

const dbUrl = localDbUrl();
const host = dbUrl ? new URL(dbUrl).hostname : null;

if (!host || !LOCAL_HOSTS.has(host)) {
  console.error(`Refusing to run pgTAP: the database host is ${host ?? 'unknown'}, not the local stack.`);
  process.exit(1);
}
if (process.env.SUPABASE_DB_URL || process.env.DATABASE_URL) {
  console.error('Refusing to run pgTAP while SUPABASE_DB_URL or DATABASE_URL is set; it only runs on the local stack.');
  process.exit(1);
}

const projectId =
  process.env.SUPABASE_PROJECT_ID ??
  /^project_id\s*=\s*"([^"]+)"/m.exec(readFileSync(join(import.meta.dirname, '../supabase/config.toml'), 'utf8'))?.[1];
const container = `supabase_db_${projectId}`;
let publishedPorts = '';
try {
  const running = execFileSync('docker', ['inspect', '-f', '{{.State.Running}}', container], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (running.trim() === 'true')
    publishedPorts = execFileSync('docker', ['port', container, '5432'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
} catch {
  publishedPorts = '';
}
const dbPort = new URL(dbUrl).port;
if (!publishedPorts.split('\n').some((line) => line.trim().endsWith(`:${dbPort}`))) {
  console.error(`Refusing to run pgTAP: no running ${container} container publishes port ${dbPort}.`);
  process.exit(1);
}
