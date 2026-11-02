import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ISOLATED_GIT_OPTIONS = [
  '-c',
  'user.name=Deploy Test',
  '-c',
  'user.email=deploy-test@example.com',
  '-c',
  'commit.gpgsign=false',
  '-c',
  'core.hooksPath=/dev/null',
  '-c',
  'init.defaultBranch=main',
];

function gitEnvironment(): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
}

export function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', [...ISOLATED_GIT_OPTIONS, ...args], { cwd, encoding: 'utf8', env: gitEnvironment() });
}

export function writeRepoFile(repo: string, path: string, content: string): void {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), content);
}
