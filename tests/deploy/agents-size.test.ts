import { describe, expect, it } from 'vitest';
import { AGENTS_DOC_BYTE_LIMIT, oversizedAgentsDocs, sizeReport } from '../../scripts/docs/agents-size.ts';

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
