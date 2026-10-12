import { describe, expect, it } from 'vitest';
import {
  ChangelogError,
  compareVersions,
  parseChangelog,
  parseVersion,
  releasesAfter,
  toBundledReleases,
  whatsNewDecision,
  whatsNewMayOpen,
} from '../../web/src/lib/changelog-rules.ts';

function validEntries() {
  return [
    { prs: [71, 72], version: '1.2.0', date: '2026-11-02', title: 'Rest timer', items: ['A louder rest alert.'] },
    { prs: [70], version: '1.1.0', date: '2026-10-20', title: 'Plates', items: ['Plate maths.', 'Bar picker.'] },
    { prs: [], version: '1.0.0', date: '2026-10-09', title: 'Gainscape changelog', items: ['Release notes.'] },
  ];
}

function withEntry(index: number, change: Record<string, unknown>) {
  return validEntries().map((entry, position) => (position === index ? { ...entry, ...change } : entry));
}

function problemsOf(raw: unknown): string[] {
  try {
    parseChangelog(raw);
  } catch (error) {
    expect(error).toBeInstanceOf(ChangelogError);
    return (error as ChangelogError).problems;
  }
  throw new Error('expected the changelog to be rejected');
}

function expectProblem(raw: unknown, entryNumber: number, field: string) {
  const problems = problemsOf(raw);
  expect(problems.some((problem) => problem.startsWith(`entry ${entryNumber}`) && problem.includes(field))).toBe(true);
}

describe('versions', () => {
  it('reads strict MAJOR.MINOR.PATCH versions', () => {
    expect(parseVersion('1.10.0')).toEqual([1, 10, 0]);
    expect(parseVersion('0.1.0')).toEqual([0, 1, 0]);
  });

  it.each(['1.0', 'v1.0.0', '01.0.0', '1.0.0-beta', '1.0.0.0', '', ' 1.0.0'])('rejects %j', (text) => {
    expect(parseVersion(text)).toBeNull();
  });

  it('compares each part as a number', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareVersions('2.0.0', '1.99.99')).toBeGreaterThan(0);
    expect(compareVersions('1.0.1', '1.0.2')).toBeLessThan(0);
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
  });
});

describe('parsing the changelog', () => {
  it('accepts a valid changelog, including an entry that covers no PRs', () => {
    expect(parseChangelog(validEntries())).toEqual(validEntries());
  });

  it('rejects an empty list and a value that is not a list', () => {
    expect(problemsOf([])).not.toHaveLength(0);
    expect(problemsOf({ version: '1.0.0' })).not.toHaveLength(0);
  });

  it.each(['1.0', 'v1.0.0', '01.0.0', '1.0.0-beta'])('rejects version %j and names the entry', (version) => {
    expectProblem(withEntry(1, { version }), 2, 'version');
  });

  it('rejects a duplicate version, equal neighbours and ascending order', () => {
    expectProblem(withEntry(2, { version: '1.2.0' }), 3, 'version');
    expectProblem(withEntry(1, { version: '1.2.0' }), 2, 'version');
    expectProblem([...validEntries()].reverse(), 2, 'version');
  });

  it('rejects empty items and empty or blank item text', () => {
    expectProblem(withEntry(0, { items: [] }), 1, 'items');
    expectProblem(withEntry(0, { items: [''] }), 1, 'items');
    expectProblem(withEntry(0, { items: ['Fine.', '   '] }), 1, 'items');
  });

  it('rejects the same item twice in one release', () => {
    expectProblem(withEntry(1, { items: ['Plate maths.', 'Bar picker.', 'Plate maths.'] }), 2, 'items');
  });

  it('accepts the same item in two releases', () => {
    expect(() => parseChangelog(withEntry(0, { items: ['Plate maths.'] }))).not.toThrow();
  });

  it('rejects an empty or blank title', () => {
    expectProblem(withEntry(1, { title: '' }), 2, 'title');
    expectProblem(withEntry(1, { title: '  ' }), 2, 'title');
  });

  it.each([['2026-02-30'], ['2026-13-01'], ['2026-12-32'], ['2026-1-5'], [20261020], ['']])(
    'rejects date %j',
    (date) => {
      expectProblem(withEntry(1, { date }), 2, 'date');
    },
  );

  it('rejects a date later than the entry above it', () => {
    expectProblem(withEntry(1, { date: '2026-11-03' }), 2, 'date');
  });

  it('accepts the same date as the entry above it', () => {
    expect(() => parseChangelog(withEntry(1, { date: '2026-11-02' }))).not.toThrow();
  });

  it.each(['category', 'link'])('rejects the unknown key %j', (key) => {
    expectProblem(withEntry(0, { [key]: 'x' }), 1, key);
  });

  it('rejects a missing prs list', () => {
    const entries: Record<string, unknown>[] = validEntries();
    delete entries[1].prs;
    expectProblem(entries, 2, 'prs');
  });

  it.each([[[0]], [[-1]], [[1.5]], [['70']], [[70, 70]]])('rejects prs %j', (prs) => {
    expectProblem(withEntry(1, { prs }), 2, 'prs');
  });

  it('rejects a PR number covered by two entries', () => {
    expectProblem(withEntry(2, { prs: [70] }), 3, 'prs');
  });

  it('reports every problem at once', () => {
    const raw = withEntry(0, { title: '', items: [] });
    expect(problemsOf(raw).length).toBeGreaterThanOrEqual(2);
  });
});

describe('bundled releases', () => {
  it('drops prs and keeps every other field', () => {
    expect(toBundledReleases(validEntries())).toEqual([
      { version: '1.2.0', date: '2026-11-02', title: 'Rest timer', items: ['A louder rest alert.'] },
      { version: '1.1.0', date: '2026-10-20', title: 'Plates', items: ['Plate maths.', 'Bar picker.'] },
      { version: '1.0.0', date: '2026-10-09', title: 'Gainscape changelog', items: ['Release notes.'] },
    ]);
  });

  it('ignores a covers-only change to prs', () => {
    const before = toBundledReleases(parseChangelog(validEntries()));
    const after = toBundledReleases(parseChangelog(withEntry(0, { prs: [71, 72, 73] })));
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
    expect(whatsNewDecision(after, { status: 'seen', version: before[0].version })).toEqual({ kind: 'none' });
  });
});

describe('releases after a version', () => {
  const releases = toBundledReleases(validEntries());

  it('returns the newer releases, newest first', () => {
    expect(releasesAfter(releases, '1.0.0').map((release) => release.version)).toEqual(['1.2.0', '1.1.0']);
    expect(releasesAfter(releases, '1.1.0').map((release) => release.version)).toEqual(['1.2.0']);
  });

  it('returns nothing for the current version', () => {
    expect(releasesAfter(releases, '1.2.0')).toEqual([]);
  });
});

describe('what the What’s new sheet does', () => {
  const releases = toBundledReleases(validEntries());

  it('records the current version silently when nothing is stored', () => {
    expect(whatsNewDecision(releases, { status: 'absent' })).toEqual({ kind: 'record', version: '1.2.0' });
  });

  it('records the current version when the stored value is not a version', () => {
    expect(whatsNewDecision(releases, { status: 'seen', version: 'banana' })).toEqual({
      kind: 'record',
      version: '1.2.0',
    });
  });

  it('does nothing for the current version or a newer one after a rollback', () => {
    expect(whatsNewDecision(releases, { status: 'seen', version: '1.2.0' })).toEqual({ kind: 'none' });
    expect(whatsNewDecision(releases, { status: 'seen', version: '1.3.0' })).toEqual({ kind: 'none' });
  });

  it('shows every release after an older stored version', () => {
    expect(whatsNewDecision(releases, { status: 'seen', version: '1.1.0' })).toEqual({
      kind: 'show',
      releases: [releases[0]],
    });
    expect(whatsNewDecision(releases, { status: 'seen', version: '1.0.0' })).toEqual({
      kind: 'show',
      releases: [releases[0], releases[1]],
    });
  });

  it('does nothing when storage is unavailable', () => {
    expect(whatsNewDecision(releases, { status: 'unavailable' })).toEqual({ kind: 'none' });
  });
});

describe('when the sheet may open', () => {
  const DONE = { status: 'done' } as const;

  it('waits while the first-run intro has not been finished on this device', () => {
    const absent = { status: 'absent' } as const;
    expect(
      whatsNewMayOpen({ pathname: '/', hasDraft: false, draftChangedDuringVisit: false, onboarding: absent }),
    ).toBe(false);
    expect(
      whatsNewMayOpen({ pathname: '/skills', hasDraft: false, draftChangedDuringVisit: false, onboarding: absent }),
    ).toBe(false);
  });

  it('opens when the intro record cannot be read', () => {
    expect(
      whatsNewMayOpen({
        pathname: '/',
        hasDraft: false,
        draftChangedDuringVisit: false,
        onboarding: { status: 'unavailable' },
      }),
    ).toBe(true);
  });

  it('waits while a workout draft exists', () => {
    expect(whatsNewMayOpen({ pathname: '/', hasDraft: true, draftChangedDuringVisit: false, onboarding: DONE })).toBe(
      false,
    );
    expect(
      whatsNewMayOpen({ pathname: '/skills', hasDraft: true, draftChangedDuringVisit: false, onboarding: DONE }),
    ).toBe(false);
  });

  it('waits on the workout reveal', () => {
    expect(
      whatsNewMayOpen({ pathname: '/reveal', hasDraft: false, draftChangedDuringVisit: false, onboarding: DONE }),
    ).toBe(false);
  });

  it('waits on the workout screen after its draft changed until the next visit', () => {
    expect(whatsNewMayOpen({ pathname: '/', hasDraft: false, draftChangedDuringVisit: true, onboarding: DONE })).toBe(
      false,
    );
    expect(
      whatsNewMayOpen({ pathname: '/skills', hasDraft: false, draftChangedDuringVisit: true, onboarding: DONE }),
    ).toBe(true);
  });

  it('opens on any other screen without a draft', () => {
    expect(whatsNewMayOpen({ pathname: '/', hasDraft: false, draftChangedDuringVisit: false, onboarding: DONE })).toBe(
      true,
    );
    expect(
      whatsNewMayOpen({
        pathname: '/profile/settings',
        hasDraft: false,
        draftChangedDuringVisit: false,
        onboarding: DONE,
      }),
    ).toBe(true);
  });
});
