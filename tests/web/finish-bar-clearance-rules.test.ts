import { describe, expect, it } from 'vitest';
import { scrollToClearFinishBar } from '../../web/src/lib/workout/finish-bar-clearance-rules.ts';

const barTop = 500;
const gap = 8;

describe('scrollToClearFinishBar', () => {
  it('scrolls a field under the bar up until its bottom sits a gap above the bar', () => {
    expect(scrollToClearFinishBar({ top: 510, bottom: 556 }, barTop, gap)).toBe(64);
  });

  it('scrolls a field that only dips into the gap above the bar', () => {
    expect(scrollToClearFinishBar({ top: 450, bottom: 496 }, barTop, gap)).toBe(4);
  });

  it('leaves a field that already clears the bar where it is', () => {
    expect(scrollToClearFinishBar({ top: 400, bottom: 492 }, barTop, gap)).toBe(0);
    expect(scrollToClearFinishBar({ top: 100, bottom: 146 }, barTop, gap)).toBe(0);
  });

  it('never scrolls a field taller than the room above the bar past the top of the screen', () => {
    expect(scrollToClearFinishBar({ top: 40, bottom: 900 }, barTop, gap)).toBe(40);
    expect(scrollToClearFinishBar({ top: -20, bottom: 900 }, barTop, gap)).toBe(0);
  });
});
