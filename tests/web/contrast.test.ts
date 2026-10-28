import { describe, expect, it } from 'vitest';
import { contrast, CONTROL_GLYPH_MINIMUM, CONTROL_GLYPHS, CONTROL_SURFACES, token } from './token-contrast.ts';

const SURFACES = [
  'color-backdrop',
  'color-background',
  'color-background-dots',
  'color-panel',
  'color-panel-shade',
  'color-chrome',
  'color-well',
];
const SECONDARY_TEXT = ['color-text-muted', 'color-text-faint', 'color-rare', 'color-danger'];
const SECONDARY_TEXT_HEADROOM = 5;
const BODY_TEXT = [
  'color-text',
  'color-text-muted',
  'color-text-faint',
  'color-accent',
  'color-xp',
  'color-rare',
  'color-danger',
];

const pairs: [string, string, number][] = [
  ...BODY_TEXT.flatMap((text) => SURFACES.map((surface): [string, string, number] => [text, surface, 4.5])),
  ...SECONDARY_TEXT.flatMap((text) =>
    SURFACES.map((surface): [string, string, number] => [text, surface, SECONDARY_TEXT_HEADROOM]),
  ),
  ['color-ink', 'color-parchment', 4.5],
  ['color-ink', 'color-accent', 4.5],
  ['color-ink', 'color-danger-fill', 4.5],
  ['color-placeholder', 'color-parchment', 4.5],
  ['color-accent-light', 'color-panel-border', 4.5],
  ['color-focus', 'color-background', 3],
  ['color-focus', 'color-panel', 3],
  ['color-input-border', 'color-parchment', 3],
];

describe('colour contrast', () => {
  it.each(pairs)('--%s on --%s reaches %d:1', (foreground, background, minimum) => {
    expect(contrast(token(foreground), token(background))).toBeGreaterThanOrEqual(minimum);
  });

  it.each(CONTROL_GLYPHS.flatMap((glyph) => CONTROL_SURFACES.map((surface) => [glyph, surface])))(
    'control glyph --%s on --%s reaches 3:1',
    (glyph, surface) => {
      expect(contrast(token(glyph), token(surface))).toBeGreaterThanOrEqual(CONTROL_GLYPH_MINIMUM);
    },
  );

  it('keeps --color-panel-border out of the control glyphs, because it fails 3:1 on --color-well', () => {
    expect(CONTROL_GLYPHS).not.toContain('color-panel-border');
    expect(contrast(token('color-panel-border'), token('color-well'))).toBeLessThan(CONTROL_GLYPH_MINIMUM);
  });

  it('computes the WCAG ratio', () => {
    expect(contrast('#000', '#fff')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });
});
