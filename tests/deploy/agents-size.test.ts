import { describe, expect, it } from 'vitest';
import {
  AGENTS_DOC_BYTE_LIMIT,
  AGENTS_DOC_WARNING_BYTES,
  agentsDocsNearLimit,
  nearLimitReport,
  oversizedAgentsDocs,
  sizeReport,
} from '../../scripts/docs/agents-size.ts';

describe('the AGENTS.md size guard', () => {
  it('allows 16 KiB per file', () => {
    expect(AGENTS_DOC_BYTE_LIMIT).toBe(16_384);
  });

  it('passes files at or under the limit', () => {
    expect(
      oversizedAgentsDocs([
        { path: 'AGENTS.md', bytes: 16_384 },
        { path: 'web/AGENTS.md', bytes: 120 },
      ]),
    ).toEqual([]);
  });

  it('flags every file over the limit, largest first', () => {
    expect(
      oversizedAgentsDocs([
        { path: 'web/AGENTS.md', bytes: 16_385 },
        { path: 'tests/AGENTS.md', bytes: 400 },
        { path: 'web/src/lib/AGENTS.md', bytes: 269_055 },
      ]),
    ).toEqual([
      { path: 'web/src/lib/AGENTS.md', bytes: 269_055 },
      { path: 'web/AGENTS.md', bytes: 16_385 },
    ]);
  });

  it('honours a custom limit', () => {
    expect(oversizedAgentsDocs([{ path: 'AGENTS.md', bytes: 101 }], 100)).toEqual([{ path: 'AGENTS.md', bytes: 101 }]);
  });

  it('reports each oversized file with its size and the limit', () => {
    expect(sizeReport({ path: 'web/AGENTS.md', bytes: 20_000 })).toBe(
      'web/AGENTS.md is 20000 bytes, over the 16384 byte limit',
    );
  });
});

describe('the AGENTS.md size warning', () => {
  it('warns from 12 KiB per file', () => {
    expect(AGENTS_DOC_WARNING_BYTES).toBe(12_288);
  });

  it('warns about files over the warning size but within the limit, largest first', () => {
    expect(
      agentsDocsNearLimit([
        { path: 'AGENTS.md', bytes: 12_288 },
        { path: 'e2e/AGENTS.md', bytes: 12_289 },
        { path: 'web/AGENTS.md', bytes: 16_384 },
        { path: 'tests/AGENTS.md', bytes: 16_385 },
      ]),
    ).toEqual([
      { path: 'web/AGENTS.md', bytes: 16_384 },
      { path: 'e2e/AGENTS.md', bytes: 12_289 },
    ]);
  });

  it('reports each file near the limit with its size and the room left', () => {
    expect(nearLimitReport({ path: 'e2e/AGENTS.md', bytes: 13_000 })).toBe(
      'e2e/AGENTS.md is 13000 bytes, over the 12288 byte warning size; 3384 bytes left before the 16384 byte limit',
    );
  });
});
