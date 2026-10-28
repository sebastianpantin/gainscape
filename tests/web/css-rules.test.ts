import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss, { type AtRule, type Declaration, type Node, type Root, type Rule } from 'postcss';
import { describe, expect, it } from 'vitest';
import { CONTROL_GLYPHS } from './token-contrast.ts';

const stylesDir = join(import.meta.dirname, '../../web/src/styles');
const TOKENS_FILE = 'tokens.css';
const sheets = readdirSync(stylesDir)
  .filter((file) => file.endsWith('.css'))
  .map((file) => ({ file, root: postcss.parse(readFileSync(join(stylesDir, file), 'utf8')) }));
const areaSheets = sheets.filter(({ file }) => file !== TOKENS_FILE);
const tokensRoot = sheets.find(({ file }) => file === TOKENS_FILE)!.root;

const COLOUR_LITERAL =
  /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(|(?<![-\w])(?:black|white|red|green|blue|gray|grey|silver|orange|yellow|purple)(?![-\w])/i;
const TOKEN_REFERENCE = /var\(--[a-z0-9-]+\)/g;
const DISPLAY_FONT_SIZES = ['1.05rem', '1.15rem', '1.6rem', '1.75rem', '1.9rem', '2.1rem', '2.75rem', '2.9rem'];
const MAX_CONTROL_BEVELS = 10;
const MIN_TYPE_STEP_RATIO = 1.08;
const BEVELLED_SURFACES = new Set([
  '.panel',
  '.first-run-card, .first-run-choice',
  '.first-run-card-icon',
  '.first-run-pip.lit',
  '.term-help-panel:popover-open',
  'input, select',
  '.notes-field textarea',
  '.toast',
  '.monogram',
  '.profile-badge',
  '.strength-bar',
  '.exercise-menu-actions',
  '.set-menu:popover-open',
  '.level-ups',
  '.skill-card',
  '.tab-bar',
  '.active-workout-bar',
]);

interface Found {
  file: string;
  rule: Rule;
}

function rulesIn(roots: readonly { file: string; root: Root }[]): Found[] {
  const found: Found[] = [];
  for (const { file, root } of roots) {
    root.walkRules((rule) => {
      if (rule.parent?.type === 'atrule' && (rule.parent as AtRule).name === 'keyframes') return;
      found.push({ file, rule });
    });
  }
  return found;
}

function oneLine(selector: string): string {
  return selector.replace(/\s+/g, ' ').trim();
}

function declarations(rule: Rule, property?: string): Declaration[] {
  return rule.nodes.filter(
    (node): node is Declaration => node.type === 'decl' && (property === undefined || node.prop === property),
  );
}

function selectorsOf(rule: Rule): string[] {
  return rule.selectors.map(oneLine);
}

function rulesFor(selector: string): Rule[] {
  return areaRules.map(({ rule }) => rule).filter((rule) => selectorsOf(rule).includes(selector));
}

function withinHoverMedia(rule: Rule): boolean {
  let parent: Node | undefined = rule.parent;
  while (parent) {
    if (
      parent.type === 'atrule' &&
      (parent as AtRule).name === 'media' &&
      /\(hover:\s*hover\)/.test((parent as AtRule).params)
    )
      return true;
    parent = parent.parent;
  }
  return false;
}

function isBevel(value: string): boolean {
  return /\binset\b|var\(--bevel/.test(value);
}

const areaRules = rulesIn(areaSheets);

describe('stylesheet rules', () => {
  it('puts every :hover rule inside @media (hover: hover), so a tap never leaves a sticky hover', () => {
    const outside = areaRules
      .filter(({ rule }) => rule.selector.includes(':hover') && !withinHoverMedia(rule))
      .map(({ file, rule }) => `${file}: ${oneLine(rule.selector)}`);
    expect(outside).toEqual([]);
  });

  it('keeps colour literals in tokens.css', () => {
    const literals: string[] = [];
    for (const { file, root } of areaSheets) {
      root.walkDecls((declaration) => {
        if (COLOUR_LITERAL.test(declaration.value.replace(TOKEN_REFERENCE, '')))
          literals.push(`${file}: ${declaration.prop}: ${declaration.value}`);
      });
    }
    expect(literals).toEqual([]);
  });

  it('declares a dark colour scheme on :root', () => {
    const scheme: string[] = [];
    tokensRoot.walkRules(':root', (rule) => declarations(rule, 'color-scheme').forEach((d) => scheme.push(d.value)));
    expect(scheme).toEqual(['dark']);
  });

  it('derives the bottom clearance from the tab bar height instead of a raw 96px', () => {
    const raw: string[] = [];
    for (const { file, root } of areaSheets) {
      root.walkDecls((declaration) => {
        if (/\b96px\b/.test(declaration.value)) raw.push(`${file}: ${declaration.prop}: ${declaration.value}`);
      });
    }
    expect(raw).toEqual([]);
  });

  it.each([
    ['.tab-bar', ['left', 'right']],
    ['.toast-region', ['left', 'right']],
    ['.reveal-skip', ['right']],
  ])('keeps %s clear of the side safe areas', (selector, sides) => {
    const values = rulesFor(selector)
      .flatMap((rule) => declarations(rule))
      .map((declaration) => declaration.value)
      .join(' ');
    for (const side of sides) expect(values, side).toContain(`env(safe-area-inset-${side})`);
  });

  it('gives summary the shared focus ring', () => {
    const shared = areaRules.find(({ rule }) => selectorsOf(rule).includes('button:focus-visible'));
    expect(shared && selectorsOf(shared.rule)).toContain('summary:focus-visible');
  });

  it('uses --color-focus only for focus rings', () => {
    const misused = areaRules
      .filter(({ rule }) => !rule.selector.includes(':focus'))
      .filter(({ rule }) => declarations(rule).some((declaration) => declaration.value.includes('--color-focus')))
      .map(({ file, rule }) => `${file}: ${oneLine(rule.selector)}`);
    expect(misused).toEqual([]);
  });

  it('pairs every outline: none with a :focus-visible ring for the same element', () => {
    const allSelectors = new Set(areaRules.flatMap(({ rule }) => selectorsOf(rule)));
    const missing = areaRules
      .filter(({ rule }) => declarations(rule, 'outline').some((declaration) => /^(none|0)$/.test(declaration.value)))
      .flatMap(({ rule }) => selectorsOf(rule))
      .map((selector) => selector.replace(/:focus(:not\(:focus-visible\))?$/, ''))
      .filter((base) => !allSelectors.has(`${base}:focus-visible`));
    expect(missing).toEqual([]);
  });

  it('draws the unticked done toggle glyph in a control glyph colour that reaches 3:1 on the well', () => {
    const colours = areaRules
      .filter(({ rule }) => selectorsOf(rule).some((selector) => /^\.(button\.toggle|done-toggle)$/.test(selector)))
      .flatMap(({ rule }) => declarations(rule, 'color'))
      .map((declaration) => /^var\(--([a-z0-9-]+)\)$/.exec(declaration.value)?.[1] ?? declaration.value);
    expect(colours.length).toBeGreaterThan(0);
    for (const colour of colours) expect(CONTROL_GLYPHS).toContain(colour);
  });

  it('gives a disabled primary button its own flat look, so a disabled main action reads as unavailable', () => {
    const disabledPrimary = rulesFor('.button.primary:disabled');
    expect(disabledPrimary.flatMap((rule) => declarations(rule, 'background'))).toHaveLength(1);
    expect(disabledPrimary.flatMap((rule) => declarations(rule, 'box-shadow')).map((d) => d.value)).toEqual(['none']);
  });

  it(`keeps the bevelled control styles to ${MAX_CONTROL_BEVELS} rules, so buttons share .button modifiers`, () => {
    const bevelled = areaRules
      .filter(({ rule }) => declarations(rule, 'box-shadow').some((declaration) => isBevel(declaration.value)))
      .map(({ rule }) => oneLine(rule.selector))
      .filter((selector) => !BEVELLED_SURFACES.has(selector));
    expect(bevelled.length, bevelled.join('\n')).toBeLessThanOrEqual(MAX_CONTROL_BEVELS);
  });

  it('keeps adjacent type-scale steps at least 8% apart, so no two sizes look the same', () => {
    const steps: number[] = [];
    tokensRoot.walkDecls(/^--font-size-/, (declaration) => {
      steps.push(parseFloat(declaration.value));
    });
    const tooClose = steps.slice(1).filter((size, index) => size / steps[index] < MIN_TYPE_STEP_RATIO);
    expect(steps.length).toBeGreaterThan(4);
    expect(tooClose).toEqual([]);
  });

  it('sizes text with the type scale or a listed display size, never below 12px', () => {
    const offScale: string[] = [];
    for (const { file, root } of areaSheets) {
      root.walkDecls('font-size', (declaration) => {
        const value = declaration.value;
        if (/^var\(--font-size-[a-z0-9]+\)$/.test(value) || value === 'inherit') return;
        if (!DISPLAY_FONT_SIZES.includes(value)) offScale.push(`${file}: ${value}`);
      });
    }
    expect(offScale).toEqual([]);
  });
});
