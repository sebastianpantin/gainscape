import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { readChangelogEntries } from '../../web/build/changelog.ts';
import { isDocumentation } from '../ci-changes.ts';
import { unknownPrsProblem } from '../deploy/rules.ts';

export interface PrCommit {
  kind: 'pr';
  number: number;
  title: string;
  sha: string;
}

export interface DirectCommit {
  kind: 'direct';
  sha: string;
  subject: string;
}

export type FirstParentCommit = PrCommit | DirectCommit;

export interface MergedPr extends PrCommit {
  files: readonly string[];
}

export interface DirectChange extends DirectCommit {
  files: readonly string[];
}

export type ChangedCommit = MergedPr | DirectChange;

export interface Unreleased {
  uncovered: MergedPr[];
  unknown: number[];
  uncoveredDirect: DirectChange[];
  direct: DirectCommit[];
}

const FIRST_PARENT_LOG_FORMAT = '%H%x1f%P%x1f%s%x1f%b%x1e';

const CHANGELOG_FILE = 'web/changelog.yaml';
const MERGE_SUBJECT = /^Merge pull request #(\d+) from (\S+)$/;
const SQUASH_SUBJECT = /^(.+) \(#(\d+)\)$/;

const REPO_LOCATING_GIT_VARIABLES = new Set([
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_COMMON_DIR',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_PREFIX',
]);

const INTERNAL_PREFIXES = [
  '.github/',
  'scripts/',
  'tests/',
  'e2e/',
  '.omc/',
  '.claude/',
  '.githooks/',
  'supabase/tests/',
];

const INTERNAL_FILES = [
  'Makefile',
  'eslint.config.js',
  'tsconfig.json',
  'tsconfig.sw.json',
  '.prettierrc.json',
  '.gitleaks.toml',
  'playwright.config.ts',
  'playwright.pwa.config.ts',
  'playwright.pages.config.ts',
  'vitest.config.ts',
  '.gitignore',
  '.prettierignore',
  'package.json',
  'package-lock.json',
  CHANGELOG_FILE,
];

function parseLogRecord(record: string): FirstParentCommit {
  const [sha, parents, subject, body] = record.split('\x1f');
  const parentCount = parents.split(' ').filter(Boolean).length;
  const merge = parentCount === 2 ? MERGE_SUBJECT.exec(subject) : null;
  if (merge) {
    const bodyLine = body.split('\n').find((line) => line.trim() !== '');
    const branch = merge[2].slice(merge[2].indexOf('/') + 1);
    return { kind: 'pr', number: Number(merge[1]), title: bodyLine?.trim() ?? branch, sha };
  }
  const squash = parentCount === 1 ? SQUASH_SUBJECT.exec(subject) : null;
  if (squash) return { kind: 'pr', number: Number(squash[2]), title: squash[1], sha };
  return { kind: 'direct', sha, subject };
}

export function parseFirstParentLog(text: string): FirstParentCommit[] {
  return text
    .split('\x1e')
    .map((record) => record.replace(/^\n+/, ''))
    .filter((record) => record.trim() !== '')
    .map(parseLogRecord);
}

export function isInternalPath(path: string): boolean {
  return (
    isDocumentation(path) ||
    INTERNAL_FILES.includes(path) ||
    INTERNAL_PREFIXES.some((prefix) => path.startsWith(prefix))
  );
}

export function classifyPr(files: readonly string[]): 'internal' | 'user-facing' {
  return files.length > 0 && files.every(isInternalPath) ? 'internal' : 'user-facing';
}

export function coveredPrs(entries: readonly { prs: readonly number[] }[]): Set<number> {
  return new Set(entries.flatMap((entry) => entry.prs));
}

export function uncoveredPrs(prs: readonly MergedPr[], covered: ReadonlySet<number>): MergedPr[] {
  const seen = new Set<number>();
  return prs.filter((pr) => {
    if (seen.has(pr.number)) return false;
    seen.add(pr.number);
    return !covered.has(pr.number) && classifyPr(pr.files) === 'user-facing';
  });
}

export function unknownCoveredPrs(covered: ReadonlySet<number>, prNumbersInRange: readonly number[]): number[] {
  return [...covered].filter((number) => !prNumbersInRange.includes(number)).sort((a, b) => a - b);
}

export function directCommits(commits: readonly FirstParentCommit[]): DirectCommit[] {
  return commits.filter((commit) => commit.kind === 'direct');
}

export function uncoveredDirectCommits(newestFirst: readonly ChangedCommit[]): DirectChange[] {
  let changelogChangedSince = false;
  const uncovered: DirectChange[] = [];
  for (const commit of newestFirst) {
    changelogChangedSince ||= commit.files.includes(CHANGELOG_FILE);
    if (commit.kind === 'direct' && !changelogChangedSince && classifyPr(commit.files) === 'user-facing') {
      uncovered.push(commit);
    }
  }
  return uncovered;
}

export function directCommitWarning(commit: DirectCommit): string {
  return `direct ${commit.sha.slice(0, 7)} ${commit.subject} (pushed without a PR; not blocking)`;
}

export function formatUnreleased({
  uncovered,
  uncoveredDirect,
  direct,
}: Pick<Unreleased, 'uncovered' | 'uncoveredDirect' | 'direct'>): string {
  const prLines = uncovered.flatMap((pr) => [`#${pr.number} ${pr.title}`, ...pr.files.map((file) => `  ${file}`)]);
  const directLines = uncoveredDirect.flatMap((commit) => [
    `direct ${commit.sha.slice(0, 7)} ${commit.subject} (pushed without a PR and changes the app; cover it in the next entry)`,
    ...commit.files.map((file) => `  ${file}`),
  ]);
  const coverage = [...prLines, ...directLines];
  return [
    ...(coverage.length === 0 ? ['Every user-facing PR is in the changelog.'] : coverage),
    ...direct.map(directCommitWarning),
  ].join('\n');
}

export function baseProblem({
  introducingSha,
  shallow,
}: {
  introducingSha: string | null;
  shallow: boolean;
}): string | null {
  if (shallow) return 'this clone is shallow, so merged PRs may be missing; run git fetch --unshallow and try again';
  if (introducingSha === null) {
    return `${CHANGELOG_FILE} has no history here (is the clone shallow?); the changelog is missing`;
  }
  return null;
}

export function gitIn(cwd: string, ...args: string[]): string {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !REPO_LOCATING_GIT_VARIABLES.has(name)),
  );
  return execFileSync('git', args, { cwd, encoding: 'utf8', env }).trim();
}

export function findUnreleased(cwd: string): Unreleased {
  const git = (...args: string[]) => gitIn(cwd, ...args);
  const shallow = git('rev-parse', '--is-shallow-repository') === 'true';
  const introducingSha =
    git('log', '--first-parent', '--diff-filter=A', '--format=%H', '--', CHANGELOG_FILE)
      .split('\n')
      .filter(Boolean)
      .at(-1) ?? null;
  const problem = baseProblem({ introducingSha, shallow });
  if (problem) throw new Error(problem);
  const commits = parseFirstParentLog(
    git('log', '--first-parent', `--format=${FIRST_PARENT_LOG_FORMAT}`, `${introducingSha}..HEAD`),
  );
  const changed: ChangedCommit[] = commits.map((commit) => ({
    ...commit,
    files: git('diff', '--name-only', '--no-renames', `${commit.sha}^1`, commit.sha).split('\n').filter(Boolean),
  }));
  const merged = changed.filter((commit) => commit.kind === 'pr');
  const uncoveredDirect = uncoveredDirectCommits(changed);
  const covered = coveredPrs(readChangelogEntries(join(cwd, CHANGELOG_FILE)));
  return {
    uncovered: uncoveredPrs(merged, covered),
    unknown: unknownCoveredPrs(
      covered,
      merged.map((pr) => pr.number),
    ),
    uncoveredDirect,
    direct: directCommits(commits).filter((commit) => !uncoveredDirect.some((blocking) => blocking.sha === commit.sha)),
  };
}

if (import.meta.main) {
  try {
    const unreleased = findUnreleased(join(import.meta.dirname, '../..'));
    console.log(formatUnreleased(unreleased));
    const unknown = unknownPrsProblem(unreleased.unknown);
    if (unknown) console.log(unknown);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
