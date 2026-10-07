import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildPages } from './build-pages.ts';
import {
  ask,
  assertInviteOnly,
  cliEnvironment,
  databaseCliEnvironment,
  loadDeployConfig,
  repoRoot,
  runCli,
  supabaseBin,
  wranglerBin,
} from './deploy-env.ts';
import { backupConfigProblems, configuredSecrets, linkedRefProblem, releaseProblem } from './rules.ts';

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
}

function run(command: string, args: string[], env: Record<string, string>): void {
  execFileSync(command, args, { cwd: repoRoot, env, stdio: 'inherit' });
}

async function confirm(question: string): Promise<boolean> {
  const answer = await ask(`${question} `);
  return answer.trim().toLowerCase() === 'yes';
}

function linkedRef(): string | null {
  const path = join(repoRoot, 'supabase/.temp/project-ref');
  return existsSync(path) ? readFileSync(path, 'utf8').trim() : null;
}

await runCli(async () => {
  const config = loadDeployConfig();
  git('fetch', '--quiet', 'origin', 'main');
  const release = releaseProblem({
    dirtyPaths: git('status', '--porcelain').split('\n').filter(Boolean),
    head: git('rev-parse', 'HEAD'),
    originMain: git('rev-parse', 'origin/main'),
  });
  if (release) throw new Error(release);
  const link = linkedRefProblem(config.SUPABASE_PROJECT_REF!, linkedRef());
  if (link) throw new Error(link);

  buildPages(
    {
      PATH: process.env.PATH,
      VITE_SUPABASE_URL: config.VITE_SUPABASE_URL,
      VITE_SUPABASE_PUBLISHABLE_KEY: config.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    configuredSecrets(config),
  );

  await assertInviteOnly(config);

  if (!config.GPG_RECIPIENT) {
    console.log(
      'No GPG_RECIPIENT, so no backup is taken. Set one up before testers have data (docs/deploy.md, Backups).',
    );
  } else {
    const backupProblems = backupConfigProblems(config);
    if (backupProblems.length > 0) throw new Error(backupProblems.join('\n'));
    if (
      !(await confirm('Back up first with make backup-hosted. Type yes once it is done (or on the very first deploy):'))
    ) {
      throw new Error('deploy cancelled before any change');
    }
  }
  const database = databaseCliEnvironment(config);
  run(supabaseBin, ['db', 'push', '--include-seed', '--dry-run'], database);
  if (!(await confirm(`Apply these changes to ${config.SUPABASE_PROJECT_REF}? Type yes:`))) {
    throw new Error('deploy cancelled before any change');
  }
  run(supabaseBin, ['db', 'push', '--include-seed'], database);
  run(supabaseBin, ['functions', 'deploy', '--project-ref', config.SUPABASE_PROJECT_REF!], cliEnvironment());
  run(
    wranglerBin,
    ['pages', 'deploy', 'web/dist', '--project-name', config.CLOUDFLARE_PAGES_PROJECT!, '--branch', 'main'],
    cliEnvironment(),
  );
  console.log(`Deployed ${git('rev-parse', '--short', 'HEAD')}.`);
});
