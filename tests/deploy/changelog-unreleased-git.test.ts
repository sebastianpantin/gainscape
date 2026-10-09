import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findUnreleased } from '../../scripts/changelog/unreleased.ts';

const GIT_IDENTITY = [
  '-c',
  'user.name=Changelog Test',
  '-c',
  'user.email=changelog-test@example.com',
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

function changelogYaml(prs: readonly number[]): string {
  return `- prs: [${prs.join(', ')}]\n  version: 0.1.0\n  date: 2026-10-09\n  title: Baseline\n  items:\n    - First release.\n`;
}

describe('finding unreleased pull requests in a real repository', () => {
  let workspace: string;
  let repo: string;

  function git(cwd: string, ...args: string[]): string {
    return execFileSync('git', [...GIT_IDENTITY, ...args], { cwd, encoding: 'utf8', env: gitEnvironment() });
  }

  function writeRepoFile(path: string, content: string): void {
    mkdirSync(join(repo, path, '..'), { recursive: true });
    writeFileSync(join(repo, path), content);
  }

  function mergePullRequest(number: number, branch: string, title: string, path: string, content: string): void {
    git(repo, 'switch', '--quiet', '-c', branch);
    writeRepoFile(path, content);
    git(repo, 'add', '.');
    git(repo, 'commit', '--quiet', '-m', title);
    git(repo, 'switch', '--quiet', 'main');
    git(
      repo,
      'merge',
      '--quiet',
      '--no-ff',
      '-m',
      `Merge pull request #${number} from x/${branch}`,
      '-m',
      title,
      branch,
    );
  }

  beforeAll(() => {
    workspace = mkdtempSync(join(tmpdir(), 'gainscape-changelog-'));
    repo = join(workspace, 'repo');
    mkdirSync(repo);
    git(repo, 'init', '--quiet');
    writeRepoFile('README.md', 'test repository\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '--quiet', '-m', 'Initial commit');
    mergePullRequest(1, 'changelog', 'Add changelog', 'web/changelog.yaml', changelogYaml([]));
    mergePullRequest(2, 'feature', 'Add a feature', 'web/src/a.ts', 'export const a = 1;\n');
  });

  afterAll(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it('lists the pull requests merged after the one that added the changelog', () => {
    const unreleased = findUnreleased(repo);
    expect(unreleased.uncovered.map(({ number, title, files }) => ({ number, title, files }))).toEqual([
      { number: 2, title: 'Add a feature', files: ['web/src/a.ts'] },
    ]);
    expect(unreleased.unknown).toEqual([]);
    expect(unreleased.direct).toEqual([]);
  });

  it('reads the repository at its directory even when GIT_DIR points elsewhere', () => {
    const outerGitDir = process.env.GIT_DIR;
    process.env.GIT_DIR = join(workspace, 'not-a-repository');
    try {
      expect(findUnreleased(repo).uncovered.map((pr) => pr.number)).toEqual([2]);
    } finally {
      if (outerGitDir === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = outerGitDir;
    }
  });

  it('refuses a shallow clone', () => {
    const shallow = join(workspace, 'shallow');
    git(workspace, 'clone', '--quiet', '--depth', '1', `file://${repo}`, shallow);
    expect(() => findUnreleased(shallow)).toThrow(
      'this clone is shallow, so merged PRs may be missing; run git fetch --unshallow and try again',
    );
  });

  it('lists nothing once an entry covers the pull request', () => {
    writeRepoFile('web/changelog.yaml', changelogYaml([2]));
    git(repo, 'commit', '--quiet', '-am', 'Changelog: cover #2');
    const unreleased = findUnreleased(repo);
    expect(unreleased.uncovered).toEqual([]);
    expect(unreleased.unknown).toEqual([]);
    expect(unreleased.direct.map((commit) => commit.subject)).toEqual(['Changelog: cover #2']);
  });

  it('lists both paths of a file moved out of the app as user-facing', () => {
    git(repo, 'switch', '--quiet', '-c', 'move');
    mkdirSync(join(repo, 'tests'), { recursive: true });
    git(repo, 'mv', 'web/src/a.ts', 'tests/a.ts');
    git(repo, 'commit', '--quiet', '-m', 'Move a to tests');
    git(repo, 'switch', '--quiet', 'main');
    git(
      repo,
      'merge',
      '--quiet',
      '--no-ff',
      '-m',
      'Merge pull request #3 from x/move',
      '-m',
      'Move a to tests',
      'move',
    );
    expect(findUnreleased(repo).uncovered.map(({ number, files }) => ({ number, files }))).toEqual([
      { number: 3, files: ['tests/a.ts', 'web/src/a.ts'] },
    ]);
  });
});
