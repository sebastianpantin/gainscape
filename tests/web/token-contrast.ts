import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const tokensCss = readFileSync(join(import.meta.dirname, '../../web/src/styles/tokens.css'), 'utf8');
export const tokens = new Map(
  [...tokensCss.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{3,6});/gi)].map((match) => [match[1], match[2]]),
);

export const CONTROL_GLYPHS = ['color-text', 'color-text-muted', 'color-text-faint', 'color-accent', 'color-parchment'];
export const CONTROL_SURFACES = ['color-well', 'color-chrome', 'color-background', 'color-panel'];
export const CONTROL_GLYPH_MINIMUM = 3;

export function token(name: string): string {
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

export function contrast(first: string, second: string): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}
