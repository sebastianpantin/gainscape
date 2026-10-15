import { describe, expect, it } from 'vitest';
import {
  baseProblem,
  classifyPr,
  coveredPrs,
  directCommits,
  type FirstParentCommit,
  formatUnreleased,
  isInternalPath,
  type MergedPr,
  type ChangedCommit,
  parseFirstParentLog,
  uncoveredDirectCommits,
  uncoveredPrs,
  unknownCoveredPrs,
} from '../../scripts/changelog/unreleased.ts';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const SHA_C = 'c'.repeat(40);
const SHA_D = 'd'.repeat(40);

function logRecord(sha: string, parents: readonly string[], subject: string, body = ''): string {
  return `${sha}\x1f${parents.join(' ')}\x1f${subject}\x1f${body}\x1e\n`;
}

function mergedPr(number: number, files: readonly string[], title = `PR ${number}`): MergedPr {
  return { kind: 'pr', number, title, sha: SHA_A, files };
}

const JARGON_HELP_FILES = [
  'e2e/term-help.spec.ts',
  'tests/web/glossary.test.ts',
  'web/src/components/TermHelp.tsx',
  'web/src/features/workout/WorkoutScreen.tsx',
  'web/src/lib/ui/glossary.ts',
  'web/src/styles/app.css',
];

const CI_JOB_SPLIT_FILES = [
  '.github/AGENTS.md',
  '.github/workflows/AGENTS.md',
  '.github/workflows/ci.yml',
  '.github/workflows/e2e.yml',
  'AGENTS.md',
  'Makefile',
  'README.md',
  'e2e/pwa/AGENTS.md',
  'scripts/AGENTS.md',
  'scripts/balance/AGENTS.md',
  'tests/AGENTS.md',
  'tests/balance/AGENTS.md',
  'tests/catalog/AGENTS.md',
  'tests/catalog/sim-catalog.test.ts',
  'tests/integration/AGENTS.md',
  'tests/integration/sim-catalog.test.ts',
];

const CI_SKIP_FILES = [
  '.github/AGENTS.md',
  '.github/workflows/AGENTS.md',
  '.github/workflows/ci.yml',
  'AGENTS.md',
  'Makefile',
  'README.md',
  'scripts/AGENTS.md',
  'scripts/ci-changes.ts',
  'tests/AGENTS.md',
  'tests/deploy/ci-changes.test.ts',
];

describe('reading the first-parent log', () => {
  it('reads a merge commit as its pull request, titled by the body line', () => {
    const text = logRecord(
      SHA_A,
      [SHA_B, SHA_C],
      'Merge pull request #67 from sebastianpantin/jargon-help',
      'Jargon help: explain RIR, RPE, e1RM and other training terms\n',
    );
    expect(parseFirstParentLog(text)).toEqual([
      {
        kind: 'pr',
        number: 67,
        title: 'Jargon help: explain RIR, RPE, e1RM and other training terms',
        sha: SHA_A,
      },
    ]);
  });

  it('titles a merge with an empty body by its branch name', () => {
    const text = logRecord(SHA_A, [SHA_B, SHA_C], 'Merge pull request #12 from sebastianpantin/rest-timer');
    expect(parseFirstParentLog(text)).toEqual([{ kind: 'pr', number: 12, title: 'rest-timer', sha: SHA_A }]);
  });

  it('reads a single-parent squash subject ending in (#N) as that pull request', () => {
    const text = logRecord(SHA_A, [SHA_B], "Show a What's new sheet (#70)", 'Squashed body\n');
    expect(parseFirstParentLog(text)).toEqual([
      { kind: 'pr', number: 70, title: "Show a What's new sheet", sha: SHA_A },
    ]);
  });

  it('reads the squash of a revert pull request as the revert pull request', () => {
    const text = logRecord(SHA_A, [SHA_B], 'Revert "Show a What\'s new sheet (#70)" (#72)');
    expect(parseFirstParentLog(text)).toEqual([
      { kind: 'pr', number: 72, title: 'Revert "Show a What\'s new sheet (#70)"', sha: SHA_A },
    ]);
  });

  it.each([
    ['a revert of a squash pushed without a pull request', [SHA_B], 'Revert "Show a What\'s new sheet (#70)"'],
    ['a pull request number mid-subject', [SHA_B], 'Fix (#70) layout'],
    ['a two-parent commit with a squash-like subject', [SHA_B, SHA_C], 'Show a sheet (#70)'],
    ['a plain commit', [SHA_B], 'Fix typo'],
    ['a merge with one parent', [SHA_B], 'Merge pull request #5 from x/y'],
  ])('reads %s as a direct commit', (_shape, parents, subject) => {
    expect(parseFirstParentLog(logRecord(SHA_A, parents, subject))).toEqual([{ kind: 'direct', sha: SHA_A, subject }]);
  });

  it('keeps the log order, newest first, and ignores trailing blank lines', () => {
    const text = [
      logRecord(SHA_A, [SHA_B], 'Fix typo', '\n\n'),
      logRecord(SHA_B, [SHA_C, SHA_D], 'Merge pull request #3 from x/three', 'Three\n\n\n'),
      logRecord(SHA_C, [SHA_D], 'Two (#2)'),
    ].join('');
    expect(parseFirstParentLog(`${text}\n\n`)).toEqual([
      { kind: 'direct', sha: SHA_A, subject: 'Fix typo' },
      { kind: 'pr', number: 3, title: 'Three', sha: SHA_B },
      { kind: 'pr', number: 2, title: 'Two', sha: SHA_C },
    ]);
  });

  it('reads an empty log as no commits', () => {
    expect(parseFirstParentLog('')).toEqual([]);
  });
});

describe('which paths are internal', () => {
  it.each([
    '.github/workflows/ci.yml',
    'docs/deploy.md',
    'scripts/ci-changes.ts',
    'tests/web/glossary.test.ts',
    'e2e/term-help.spec.ts',
    '.omc/plans/x.md',
    '.claude/skills/changelog/SKILL.md',
    'web/src/AGENTS.md',
    'supabase/tests/x.test.sql',
    'Makefile',
    'eslint.config.js',
    'tsconfig.json',
    'tsconfig.sw.json',
    '.nvmrc',
    '.prettierrc.json',
    '.gitleaks.toml',
    'playwright.config.ts',
    'playwright.pwa.config.ts',
    'playwright.pages.config.ts',
    'vitest.config.ts',
    '.gitignore',
    '.prettierignore',
    '.githooks/pre-commit',
    'package.json',
    'package-lock.json',
    'web/changelog.yaml',
  ])('%s is internal', (path) => {
    expect(isInternalPath(path)).toBe(true);
  });

  it.each([
    'web/src/App.tsx',
    'web/vite.config.ts',
    'supabase/migrations/x.sql',
    'supabase/functions/x/index.ts',
    'catalog/exercises.yaml',
  ])('%s is user-facing', (path) => {
    expect(isInternalPath(path)).toBe(false);
  });
});

describe('classifying a pull request', () => {
  it('is internal when every file is internal', () => {
    expect(classifyPr(['package.json', 'package-lock.json'])).toBe('internal');
    expect(classifyPr(['web/changelog.yaml'])).toBe('internal');
  });

  it('is user-facing when any file is user-facing', () => {
    expect(classifyPr(['web/changelog.yaml', 'web/src/App.tsx'])).toBe('user-facing');
  });

  it('leaves an empty file list to the writer as user-facing', () => {
    expect(classifyPr([])).toBe('user-facing');
  });

  it('classifies real pull requests from the history', () => {
    expect(classifyPr(CI_JOB_SPLIT_FILES)).toBe('internal');
    expect(classifyPr(CI_SKIP_FILES)).toBe('internal');
    expect(classifyPr(JARGON_HELP_FILES)).toBe('user-facing');
  });
});

describe('coverage', () => {
  it('covers the union of every entry prs', () => {
    expect(coveredPrs([{ prs: [70, 71] }, { prs: [] }, { prs: [69] }])).toEqual(new Set([69, 70, 71]));
  });

  it('keeps a pull request merged while the changelog for an earlier one was open', () => {
    const merged = [mergedPr(70, ['web/src/App.tsx']), mergedPr(69, ['web/src/lib/x.ts'])];
    expect(uncoveredPrs(merged, coveredPrs([{ prs: [69] }])).map((pr) => pr.number)).toEqual([70]);
  });

  it('needs coverage for a mixed pull request that also edits the changelog', () => {
    const merged = [mergedPr(71, ['web/changelog.yaml', 'web/src/App.tsx'])];
    expect(uncoveredPrs(merged, new Set()).map((pr) => pr.number)).toEqual([71]);
  });

  it('ignores a later typo fix to the changelog', () => {
    expect(uncoveredPrs([mergedPr(72, ['web/changelog.yaml'])], new Set())).toEqual([]);
  });

  it('keeps each uncovered number once, in log order', () => {
    const merged = [
      mergedPr(74, ['web/src/a.ts'], 'Newest'),
      mergedPr(73, ['web/src/b.ts'], 'Older'),
      mergedPr(74, ['web/src/c.ts'], 'Duplicate'),
    ];
    expect(uncoveredPrs(merged, new Set()).map((pr) => [pr.number, pr.title])).toEqual([
      [74, 'Newest'],
      [73, 'Older'],
    ]);
  });
});

describe('covered numbers with no merged pull request', () => {
  it('lists a number written before its pull request merged', () => {
    expect(unknownCoveredPrs(new Set([70, 69]), [69])).toEqual([70]);
  });

  it('lists them sorted', () => {
    expect(unknownCoveredPrs(new Set([90, 80, 85]), [])).toEqual([80, 85, 90]);
  });

  it('is empty without coverage', () => {
    expect(unknownCoveredPrs(new Set(), [69])).toEqual([]);
  });

  it('accepts a covered internal pull request', () => {
    expect(unknownCoveredPrs(new Set([56]), [56, 67])).toEqual([]);
  });
});

describe('direct commits', () => {
  it('keeps only the commits pushed without a pull request', () => {
    const commits: FirstParentCommit[] = [
      { kind: 'pr', number: 3, title: 'Three', sha: SHA_A },
      { kind: 'direct', sha: SHA_B, subject: 'Fix typo' },
    ];
    expect(directCommits(commits)).toEqual([{ kind: 'direct', sha: SHA_B, subject: 'Fix typo' }]);
  });
});

describe('direct commits that change the app', () => {
  function direct(sha: string, files: readonly string[], subject = 'Pushed'): ChangedCommit {
    return { kind: 'direct', sha, subject, files };
  }

  it('lists a direct commit that touches a user-facing path when no changelog change came after it', () => {
    expect(uncoveredDirectCommits([direct(SHA_A, ['web/src/App.tsx'], 'Rebased PR commit')])).toEqual([
      { kind: 'direct', sha: SHA_A, subject: 'Rebased PR commit', files: ['web/src/App.tsx'] },
    ]);
  });

  it('ignores a direct commit that touches only internal paths', () => {
    expect(uncoveredDirectCommits([direct(SHA_A, ['README.md', 'tests/web/x.test.ts'])])).toEqual([]);
  });

  it('treats a later changelog change, from a pull request or a direct commit, as covering it', () => {
    const changelogPr: ChangedCommit = { ...mergedPr(80, ['web/changelog.yaml']), sha: SHA_B };
    expect(uncoveredDirectCommits([changelogPr, direct(SHA_A, ['web/src/App.tsx'])])).toEqual([]);
    expect(
      uncoveredDirectCommits([
        direct(SHA_C, ['web/changelog.yaml'], 'Changelog: 0.4.0'),
        direct(SHA_A, ['web/src/a.ts']),
      ]),
    ).toEqual([]);
  });

  it('still lists a direct commit made after the latest changelog change', () => {
    expect(
      uncoveredDirectCommits([
        direct(SHA_D, ['supabase/functions/x/index.ts']),
        direct(SHA_C, ['web/changelog.yaml']),
        direct(SHA_A, ['web/src/a.ts']),
      ]).map((commit) => commit.sha),
    ).toEqual([SHA_D]);
  });

  it('covers a direct commit that writes its own changelog entry', () => {
    expect(uncoveredDirectCommits([direct(SHA_A, ['web/changelog.yaml', 'web/src/a.ts'])])).toEqual([]);
  });
});

describe('the helper output', () => {
  it('lists each uncovered pull request with its files, then the direct-commit warnings', () => {
    expect(
      formatUnreleased({
        uncovered: [mergedPr(70, ['web/src/App.tsx', 'web/src/lib/x.ts'], "Show a What's new sheet")],
        uncoveredDirect: [],
        direct: [{ kind: 'direct', sha: SHA_B, subject: 'Fix typo' }],
      }),
    ).toBe(
      [
        "#70 Show a What's new sheet",
        '  web/src/App.tsx',
        '  web/src/lib/x.ts',
        'direct bbbbbbb Fix typo (pushed without a PR; not blocking)',
      ].join('\n'),
    );
  });

  it('lists the direct commits that change the app with their files, and stays quiet about coverage', () => {
    expect(
      formatUnreleased({
        uncovered: [],
        uncoveredDirect: [{ kind: 'direct', sha: SHA_D, subject: 'Rebased commit', files: ['web/src/a.ts'] }],
        direct: [{ kind: 'direct', sha: SHA_C, subject: 'Tidy' }],
      }),
    ).toBe(
      [
        'direct ddddddd Rebased commit (pushed without a PR and changes the app; cover it in the next entry)',
        '  web/src/a.ts',
        'direct ccccccc Tidy (pushed without a PR; not blocking)',
      ].join('\n'),
    );
  });

  it('says every user-facing pull request is covered when none is left', () => {
    expect(formatUnreleased({ uncovered: [], uncoveredDirect: [], direct: [] })).toBe(
      'Every user-facing PR is in the changelog.',
    );
    expect(
      formatUnreleased({
        uncovered: [],
        uncoveredDirect: [],
        direct: [{ kind: 'direct', sha: SHA_C, subject: 'Tidy' }],
      }),
    ).toBe('Every user-facing PR is in the changelog.\ndirect ccccccc Tidy (pushed without a PR; not blocking)');
  });
});

describe('the history the helper needs', () => {
  it('refuses a shallow clone', () => {
    expect(baseProblem({ introducingSha: SHA_A, shallow: true })).toBe(
      'this clone is shallow, so merged PRs may be missing; run git fetch --unshallow and try again',
    );
  });

  it('refuses a changelog with no history', () => {
    expect(baseProblem({ introducingSha: null, shallow: false })).toBe(
      'web/changelog.yaml has no history here (is the clone shallow?); the changelog is missing',
    );
  });

  it('accepts a full clone with the changelog', () => {
    expect(baseProblem({ introducingSha: SHA_A, shallow: false })).toBeNull();
  });
});
