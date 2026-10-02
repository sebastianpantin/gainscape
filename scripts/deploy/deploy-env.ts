import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  authSettingsProblems,
  childEnvironment,
  type DeployConfig,
  deployConfigProblems,
  deployFileProblem,
  inRepoDeployFiles,
  parseDeployEnv,
} from './rules.ts';

export const repoRoot = join(import.meta.dirname, '../..');

export function deployEnvPath(): string {
  return process.env.GAINSCAPE_DEPLOY_ENV ?? join(homedir(), '.config/gainscape/deploy.env');
}

function repoFiles(): string[] {
  const listed = (args: string[]) =>
    execFileSync('git', ['ls-files', '-z', ...args], { cwd: repoRoot, encoding: 'utf8' })
      .split('\0')
      .filter(Boolean);
  return [
    ...listed(['--cached', '--others', '--exclude-standard']),
    ...listed(['--others', '--ignored', '--exclude-standard']),
  ];
}

export function loadDeployConfig(): DeployConfig {
  const strayFiles = inRepoDeployFiles(repoFiles());
  if (strayFiles.length > 0) {
    throw new Error(`deploy files inside the repo: ${strayFiles.join(', ')}; move them to ${deployEnvPath()}`);
  }
  const path = deployEnvPath();
  if (!existsSync(path)) throw new Error(`no deploy settings at ${path}; create it as described in docs/deploy.md`);
  const facts = lstatSync(path);
  const fileProblem = deployFileProblem(
    {
      path,
      realPath: realpathSync(path),
      isSymlink: facts.isSymbolicLink(),
      mode: facts.mode,
      ownerUid: facts.uid,
      currentUid: process.getuid?.() ?? facts.uid,
    },
    realpathSync(repoRoot),
  );
  if (fileProblem) throw new Error(fileProblem);
  const config = parseDeployEnv(readFileSync(path, 'utf8'));
  const problems = deployConfigProblems(config);
  if (problems.length > 0) throw new Error(`${path}:\n${problems.join('\n')}`);
  return config;
}

export function cliEnvironment(): Record<string, string> {
  return childEnvironment(process.env);
}

export function databaseCliEnvironment(config: DeployConfig): Record<string, string> {
  return childEnvironment(process.env, { SUPABASE_DB_PASSWORD: config.SUPABASE_DB_PASSWORD });
}

export const wranglerBin = join(repoRoot, 'node_modules/.bin/wrangler');
export const supabaseBin = join(repoRoot, 'node_modules/.bin/supabase');

export async function runCli(main: () => Promise<void> | void): Promise<void> {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

export async function assertInviteOnly(config: DeployConfig): Promise<void> {
  const response = await fetch(`${config.VITE_SUPABASE_URL}/auth/v1/settings`, {
    headers: { apikey: config.VITE_SUPABASE_ANON_KEY! },
  });
  const settings = response.ok ? await response.json().catch(() => null) : null;
  const problems = authSettingsProblems(settings);
  if (problems.length > 0) {
    throw new Error(
      `the hosted project is not invite-only:\n${problems.join('\n')}\nsee docs/deploy.md, One-time setup`,
    );
  }
}
