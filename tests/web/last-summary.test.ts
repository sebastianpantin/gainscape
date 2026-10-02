import type { SessionSummary } from '@domain/types.ts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  forgetLastSummary,
  recallLastSummary,
  rememberLastSummary,
} from '../../web/src/features/summary/last-summary.ts';
import { MemoryStorage } from './memory-storage.ts';

const summary = {
  sessionId: 'session-a',
  xpBySkill: { legs: 100 },
  levelUps: [],
  prs: [],
  drops: [],
} as unknown as SessionSummary;

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  vi.stubGlobal('sessionStorage', storage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('last summary', () => {
  it('recalls the summary it remembered', () => {
    rememberLastSummary(summary);
    expect(recallLastSummary()).toEqual(summary);
  });

  it('recalls nothing when nothing was remembered or the entry is not JSON', () => {
    expect(recallLastSummary()).toBeNull();
    storage.setItem('gainscape.last-summary', '{broken');
    expect(recallLastSummary()).toBeNull();
  });

  it('forgets the summary only when its session is listed', () => {
    rememberLastSummary(summary);
    forgetLastSummary(['session-b']);
    expect(recallLastSummary()).toEqual(summary);
    forgetLastSummary(['session-b', 'session-a']);
    expect(recallLastSummary()).toBeNull();
  });

  it('degrades silently when session storage throws', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(() => rememberLastSummary(summary)).not.toThrow();
    expect(recallLastSummary()).toBeNull();
    expect(() => forgetLastSummary(['session-a'])).not.toThrow();
  });
});
