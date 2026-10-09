import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readChangelog, readChangelogEntries } from '../../web/build/changelog.ts';
import { ChangelogError } from '../../web/src/lib/changelog-rules.ts';

describe('the changelog file', () => {
  it('holds at least one release, without prs in the bundled form', () => {
    const releases = readChangelog();
    expect(releases.length).toBeGreaterThan(0);
    for (const release of releases) expect(release).not.toHaveProperty('prs');
  });

  it('keeps prs on the entries the scripts read', () => {
    const entries = readChangelogEntries();
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) expect(Array.isArray(entry.prs)).toBe(true);
    expect(entries.map((entry) => entry.version)).toEqual(readChangelog().map((release) => release.version));
  });

  it('rejects a file whose releases are out of order', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'gainscape-changelog-')), 'changelog.yaml');
    writeFileSync(
      path,
      [
        '- prs: []',
        '  version: 0.1.0',
        '  date: 2026-10-01',
        '  title: Older',
        '  items:',
        '    - First.',
        '- prs: []',
        '  version: 0.2.0',
        '  date: 2026-10-02',
        '  title: Newer',
        '  items:',
        '    - Second.',
        '',
      ].join('\n'),
    );
    expect(() => readChangelog(path)).toThrow(ChangelogError);
  });
});
