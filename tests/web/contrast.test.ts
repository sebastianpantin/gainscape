import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const tokensCss = readFileSync(join(import.meta.dirname, '../../web/src/styles/tokens.css'), 'utf8');
const tokens = new Map(
  [...tokensCss.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{3,6});/gi)].map((match) => [match[1], match[2]]),
);

function token(name: string): string {
  const value = tokens.get(name);
  if (!value) throw new Error(`tokens.css has no --${name}`);
  return value;
}

function channels(hex: string): number[] {
  const digits = hex.slice(1);
  const full = digits.length === 3 ? [...digits].map((digit) => digit + digit).join('') : digits;
  return [0, 2, 4].map((start) => parseInt(full.slice(start, start + 2), 16) / 255);
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(first: string, second: string): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

const SURFACES = [
  'color-backdrop',
  'color-background',
  'color-background-dots',
  'color-panel',
  'color-panel-current',
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

  it('computes the WCAG ratio', () => {
    expect(contrast('#000', '#fff')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });
});
