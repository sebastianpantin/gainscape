import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cliEnvironment, loadDeployConfig, repoRoot, runCli, supabaseBin } from './deploy-env.ts';

const LOOT_SECRET_BYTES = 32;

await runCli(async () => {
  const config = loadDeployConfig();
  execFileSync(
    supabaseBin,
    ['secrets', 'set', '--env-file', '/dev/stdin', '--project-ref', config.SUPABASE_PROJECT_REF!],
    {
      cwd: repoRoot,
      env: cliEnvironment(),
      input: `LOOT_SECRET=${randomBytes(LOOT_SECRET_BYTES).toString('hex')}\n`,
      stdio: ['pipe', 'inherit', 'inherit'],
    },
  );
  console.log('Set LOOT_SECRET on the hosted project. It was never printed or written to disk.');
});
