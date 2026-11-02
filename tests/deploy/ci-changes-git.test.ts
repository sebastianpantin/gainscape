import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { changedSince } from '../../scripts/ci-changes.ts';

const GIT_OPTIONS = [
  '-c',
  'user.name=Test',
  '-c',
  'user.email=test@example.com',
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

describe('the changed paths of a real repository', () => {
  let repo: string;

  function git(...args: string[]): void {
    execFileSync('git', [...GIT_OPTIONS, ...args], { cwd: repo, env: gitEnvironment() });
  }

  function writeRepoFile(path: string, content: string): void {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), content);
  }

  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), 'gainscape-ci-changes-'));
    git('init', '--quiet');
    writeRepoFile('supabase/functions/old-fn/index.ts', 'export const handler = 1;\n'.repeat(20));
    git('add', '.');
    git('commit', '--quiet', '-m', 'Add a function');
    mkdirSync(join(repo, 'docs/archive'), { recursive: true });
    git('mv', 'supabase/functions/old-fn/index.ts', 'docs/archive/old-fn.ts');
    git('commit', '--quiet', '-m', 'Archive the function');
  });

  afterAll(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it('lists both paths of a moved file, so moving a function out of the backend still runs the backend job', () => {
    expect(changedSince('HEAD^1', repo).sort()).toEqual([
      'docs/archive/old-fn.ts',
      'supabase/functions/old-fn/index.ts',
    ]);
  });
});
