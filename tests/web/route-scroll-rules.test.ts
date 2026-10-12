import { describe, expect, it } from 'vitest';
import { restoredScrollY, shouldScrollToTop } from '../../web/src/lib/route-scroll-rules.ts';

describe('shouldScrollToTop', () => {
  it('starts a newly opened screen at the top', () => {
    expect(shouldScrollToTop('PUSH', '/skills', '/profile')).toBe(true);
  });

  it('starts a screen that replaced the previous one at the top, like History after a delete', () => {
    expect(shouldScrollToTop('REPLACE', '/collection/history/abc', '/collection/history')).toBe(true);
  });

  it('leaves Back and Forward to the restored position', () => {
    expect(shouldScrollToTop('POP', '/collection/history/abc', '/collection/history')).toBe(false);
  });

  it('keeps the position when only the query or hash of the same screen changes', () => {
    expect(shouldScrollToTop('REPLACE', '/collection', '/collection')).toBe(false);
    expect(shouldScrollToTop('PUSH', '/collection', '/collection')).toBe(false);
  });
});

describe('restoredScrollY', () => {
  it('returns Back and Forward to where the screen was scrolled when it was left', () => {
    expect(restoredScrollY('POP', 4200)).toBe(4200);
  });

  it('restores nothing for a screen never scrolled on this visit, or for a new navigation', () => {
    expect(restoredScrollY('POP', undefined)).toBeNull();
    expect(restoredScrollY('PUSH', 4200)).toBeNull();
    expect(restoredScrollY('REPLACE', 4200)).toBeNull();
  });
});
