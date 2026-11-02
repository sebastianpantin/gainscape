import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { changedSince } from '../../scripts/ci-changes.ts';
import { git, writeRepoFile } from './git-repo.ts';

describe('the changed paths of a real repository', () => {
  let repo: string;

  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), 'gainscape-ci-changes-'));
    git(repo, 'init', '--quiet');
    writeRepoFile(repo, 'supabase/functions/old-fn/index.ts', 'export const handler = 1;\n'.repeat(20));
    git(repo, 'add', '.');
    git(repo, 'commit', '--quiet', '-m', 'Add a function');
    mkdirSync(join(repo, 'docs/archive'), { recursive: true });
    git(repo, 'mv', 'supabase/functions/old-fn/index.ts', 'docs/archive/old-fn.ts');
    git(repo, 'commit', '--quiet', '-m', 'Archive the function');
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
