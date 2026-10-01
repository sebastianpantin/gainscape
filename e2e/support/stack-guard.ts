import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function assertStackEnvironment(): void {
  const stackEnvPath = join(import.meta.dirname, '../../.stack.env');
  if (!existsSync(stackEnvPath)) return;
  const expected = /^SUPABASE_PROJECT_ID=(.*)$/m.exec(readFileSync(stackEnvPath, 'utf8'))?.[1]?.trim();
  if (expected && process.env.SUPABASE_PROJECT_ID !== expected) {
    throw new Error(
      `.stack.env sets SUPABASE_PROJECT_ID=${expected} but the environment has ${process.env.SUPABASE_PROJECT_ID ?? 'none'}; ` +
        'run through make, or `set -a; . ./.stack.env; set +a` first, so e2e never drives another stack',
    );
  }
}
