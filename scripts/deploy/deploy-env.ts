import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import {
  authSettingsProblems,
  childEnvironment,
  type DeployConfig,
  deployConfigProblems,
  deployFileProblem,
  inRepoDeployFiles,
  nativeSupabasePackages,
  parseDeployEnv,
} from './rules.ts';

export const repoRoot = join(import.meta.dirname, '../..');

function deployEnvPath(): string {
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
const supabaseWrapperBin = join(repoRoot, 'node_modules/.bin/supabase');
const supabaseNativeName = process.platform === 'win32' ? 'supabase.exe' : 'supabase';

function resolvedPackageDirectory(name: string): string | undefined {
  try {
    return dirname(createRequire(import.meta.url).resolve(`${name}/package.json`));
  } catch {
    return undefined;
  }
}

export function supabaseBin(): string {
  const directory = nativeSupabasePackages(process.platform, process.arch)
    .map(resolvedPackageDirectory)
    .find((found) => found !== undefined);
  return directory === undefined ? supabaseWrapperBin : join(directory, 'bin', supabaseNativeName);
}

export async function ask(question: string): Promise<string> {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question(question);
  prompt.close();
  return answer;
}

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
    headers: { apikey: config.VITE_SUPABASE_PUBLISHABLE_KEY! },
  });
  const settings = response.ok ? await response.json().catch(() => null) : null;
  const problems = authSettingsProblems(settings);
  if (problems.length > 0) {
    throw new Error(
      `the hosted project is not invite-only:\n${problems.join('\n')}\nsee docs/deploy.md, One-time setup`,
    );
  }
}
