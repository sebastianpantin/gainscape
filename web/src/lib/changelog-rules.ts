import { z } from 'zod';

export interface Release {
  version: string;
  date: string;
  title: string;
  items: readonly string[];
}

export interface ChangelogEntry extends Release {
  prs: readonly number[];
}

export type LastSeenRelease = { status: 'unavailable' } | { status: 'absent' } | { status: 'seen'; version: string };

export type WhatsNewDecision =
  { kind: 'none' } | { kind: 'record'; version: string } | { kind: 'show'; releases: Release[] };

export class ChangelogError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(`changelog is invalid:\n${problems.map((problem) => `- ${problem}`).join('\n')}`);
    this.problems = problems;
  }
}

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const nonBlankText = z.string().refine((text) => text.trim().length > 0, 'must not be blank');

const entrySchema = z.strictObject({
  prs: z.array(z.number().int().positive()),
  version: z.string(),
  date: z.string(),
  title: nonBlankText,
  items: z.array(nonBlankText).min(1),
});

export function parseVersion(text: string): readonly [number, number, number] | null {
  const match = VERSION_PATTERN.exec(text);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

export function compareVersions(left: string, right: string): number {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  if (!leftParts || !rightParts) throw new Error(`cannot compare versions ${left} and ${right}`);
  const difference = leftParts.findIndex((part, index) => part !== rightParts[index]);
  return difference === -1 ? 0 : leftParts[difference] - rightParts[difference];
}

function isCalendarDate(text: string): boolean {
  return DATE_PATTERN.test(text) && new Date(`${text}T00:00:00Z`).toISOString().startsWith(text);
}

function shapeProblems(raw: unknown, label: string): string[] {
  const result = entrySchema.safeParse(raw);
  if (result.success) return [];
  return result.error.issues.map((issue) => {
    const field = issue.path.length > 0 ? `${issue.path.join('.')} ` : '';
    return `${label}: ${field}${issue.message}`;
  });
}

function fieldProblems(entry: ChangelogEntry, label: string): string[] {
  const problems: string[] = [];
  if (!parseVersion(entry.version)) problems.push(`${label}: version ${entry.version} is not MAJOR.MINOR.PATCH`);
  if (!isCalendarDate(entry.date)) problems.push(`${label}: date ${entry.date} is not a YYYY-MM-DD calendar date`);
  const repeated = entry.prs.filter((pr, index) => entry.prs.indexOf(pr) !== index);
  if (repeated.length > 0) problems.push(`${label}: prs lists #${repeated[0]} more than once`);
  return problems;
}

function orderProblems(entry: ChangelogEntry, above: ChangelogEntry, label: string): string[] {
  const problems: string[] = [];
  if (compareVersions(entry.version, above.version) >= 0)
    problems.push(`${label}: version ${entry.version} must be lower than ${above.version} above it`);
  if (entry.date > above.date) problems.push(`${label}: date ${entry.date} is later than ${above.date} above it`);
  return problems;
}

export function parseChangelog(raw: unknown): ChangelogEntry[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new ChangelogError(['changelog must be a non-empty list']);
  const problems: string[] = [];
  const coveredBy = new Map<number, number>();
  let above: ChangelogEntry | null = null;
  raw.forEach((candidate: unknown, index) => {
    const label = `entry ${index + 1}`;
    const shape = shapeProblems(candidate, label);
    problems.push(...shape);
    if (shape.length > 0) {
      above = null;
      return;
    }
    const entry = candidate as ChangelogEntry;
    const fields = fieldProblems(entry, label);
    problems.push(...fields);
    for (const pr of new Set(entry.prs)) {
      const earlier = coveredBy.get(pr);
      if (earlier !== undefined) problems.push(`${label}: prs #${pr} is already in entry ${earlier}`);
      else coveredBy.set(pr, index + 1);
    }
    if (above && fields.length === 0) problems.push(...orderProblems(entry, above, label));
    above = fields.length === 0 ? entry : null;
  });
  if (problems.length > 0) throw new ChangelogError(problems);
  return raw as ChangelogEntry[];
}

export function toBundledReleases(entries: readonly ChangelogEntry[]): Release[] {
  return entries.map(({ version, date, title, items }) => ({ version, date, title, items }));
}

export function releasesAfter(releases: readonly Release[], version: string): Release[] {
  return releases.filter((release) => compareVersions(release.version, version) > 0);
}

export function whatsNewDecision(releases: readonly Release[], lastSeen: LastSeenRelease): WhatsNewDecision {
  if (lastSeen.status === 'unavailable') return { kind: 'none' };
  const current = releases[0].version;
  if (lastSeen.status === 'absent' || !parseVersion(lastSeen.version)) return { kind: 'record', version: current };
  const newer = releasesAfter(releases, lastSeen.version);
  return newer.length === 0 ? { kind: 'none' } : { kind: 'show', releases: newer };
}

interface WhatsNewMoment {
  pathname: string;
  hasDraft: boolean;
  draftChangedDuringVisit: boolean;
}

export function whatsNewMayOpen({ pathname, hasDraft, draftChangedDuringVisit }: WhatsNewMoment): boolean {
  if (hasDraft || pathname === '/reveal') return false;
  return !(pathname === '/' && draftChangedDuringVisit);
}
