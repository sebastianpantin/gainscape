import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import {
  type ChangelogEntry,
  parseChangelog,
  type Release,
  toBundledReleases,
} from '../src/lib/platform/changelog-rules.ts';

const CHANGELOG_PATH = join(import.meta.dirname, '../changelog.yaml');

export function readChangelogEntries(path = CHANGELOG_PATH): ChangelogEntry[] {
  return parseChangelog(parse(readFileSync(path, 'utf8')));
}

export function readChangelog(path = CHANGELOG_PATH): Release[] {
  return toBundledReleases(readChangelogEntries(path));
}
