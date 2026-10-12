# styles

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-01

## Purpose

The whole visual layer. `tokens.css` defines the design tokens as CSS custom properties on `:root`; `app.css` is the single global stylesheet (about 1500 lines) that styles every screen with plain class selectors. Both are imported once from `../main.tsx`. The look is OSRS-inspired: dark brown parchment palette, pixel display font, square corners, bevelled panels.

## Key Files

| File         | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tokens.css` | `:root` tokens: `--color-*` palette (background, panel, text, accent, xp, rare, danger, focus), `--space-1` to `--space-4` and `--space-6` (no `--space-5`), `--font-family` (IBM Plex Mono) and `--font-display` (Pixelify Sans), font sizes, `--border-width`, `--radius: 0`, `--tap-target: 44px`, `--tab-bar-height: 70px` (the fixed tab bar without the safe area; `.tab`, `.active-workout-bar` and `.finish-bar` derive from it, so change it with the tab bar's padding), bevel and text-shadow recipes                                                                                                                                                                                        |
| `app.css`    | Global rules and component classes: base elements (`html` sets `touch-action: manipulation` against double-tap zoom, and `html, body` set `overscroll-behavior-y: none` so a workout never pull-to-refreshes or bounces; the tap highlight stays, as buttons have no `:active` style), `.screen`, `.panel`, `.button`, `.tab-bar`, `.segmented`, `.switch`, `.progress-bar`, banners (`.app-banner`), workout, reveal, history and friends layouts; `@keyframes gain-fill`, `pop`, `rise`, `chest-wiggle` (the reveal's idle loot chest); `.reveal-still` turns the reveal's `rise`, `pop` and `gain-added` animations off once it is skipped or settled; one `prefers-reduced-motion` block at the end |

## For AI Agents

### Working In This Directory

- Use tokens (`var(--color-*)`, `var(--space-*)`) rather than literal colours and sizes. New colours go into `tokens.css` first.
- Interactive targets use `min-height`/`min-width: var(--tap-target)` (44px). Keep that on any new button, link or row.
- Honour safe areas (`env(safe-area-inset-*)`) on full-width chrome, as `body`, `.screen` and the licenses page do.
- Wrap new animation in the existing `prefers-reduced-motion: reduce` block at the end of `app.css`.
- `tokens.css` is parsed by a test: only `--name: #hex;` declarations are read for contrast checks, so keep colour tokens as plain hex literals.
- Class names are the contract with TSX files in `../components/`, `../features/` and `../pwa/`. Rename in both places, and check `e2e/` selectors that use class names.
- The licenses page (`web/public/licenses/index.html`) duplicates a few token values inline because it does not load these files. Keep them in sync with `--color-background`, `--color-panel`, `--color-text` and `--color-accent`.

### Testing Requirements

- `tests/web/contrast.test.ts` reads `tokens.css` and asserts WCAG contrast for text, muted, faint and accent pairs. Add a failing contrast case there before changing a colour token (`make test-web`, no stack).
- `app.css` has no unit test. Layout and accessibility regressions are caught by `e2e/a11y.spec.ts` (axe scans, `make e2e`, needs the stack).

### Common Patterns

- Flat class selectors, no preprocessors, no CSS modules.
- Bevels via `box-shadow: var(--bevel)`; sunken inputs via `var(--bevel-sunken)`.
- Headings and score numbers use `var(--font-display)`.

## Dependencies

### Internal

- Consumed by every TSX file through class names; imported by `../main.tsx`
- Token values mirrored in `web/index.html` (`theme-color`), `web/public/manifest.webmanifest` and `../components/pixel-sprites.ts` (`APP_ICON_BACKGROUND`)

### External

- `@fontsource/ibm-plex-mono` and `@fontsource/pixelify-sans` supply the font faces

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
