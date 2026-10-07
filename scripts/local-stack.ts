import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const STACK_ENV_PATH = join(import.meta.dirname, '../.stack.env');

export interface LocalStackStatus {
  API_URL: string;
  DB_URL: string;
  FUNCTIONS_URL: string;
  PUBLISHABLE_KEY: string;
  SECRET_KEY: string;
  MAILPIT_URL: string;
}

export function stackEnvMismatch(
  stackEnvText: string | null,
  env: Readonly<Record<string, string | undefined>>,
): string | null {
  if (stackEnvText === null) return null;
  const expected = /^SUPABASE_PROJECT_ID=(.*)$/m.exec(stackEnvText)?.[1]?.trim();
  if (!expected || env.SUPABASE_PROJECT_ID === expected) return null;
  return (
    `.stack.env sets SUPABASE_PROJECT_ID=${expected} but the environment has ${env.SUPABASE_PROJECT_ID ?? 'none'}; ` +
    'run through make, or `set -a; . ./.stack.env; set +a` first'
  );
}

export function currentStackEnvMismatch(): string | null {
  return stackEnvMismatch(existsSync(STACK_ENV_PATH) ? readFileSync(STACK_ENV_PATH, 'utf8') : null, process.env);
}

export function parseStatusOutput(text: string): LocalStackStatus {
  return JSON.parse(text.slice(text.indexOf('{')));
}

export function localStackStatus(): LocalStackStatus {
  return parseStatusOutput(
    execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }),
  );
}
