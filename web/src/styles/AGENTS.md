# styles

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-01

## Purpose

The whole visual layer. `tokens.css` defines the design tokens as CSS custom properties on `:root`; `app.css` is the single global stylesheet (about 2600 lines) that styles every screen with plain class selectors. Both are imported once from `../main.tsx`. The look is OSRS-inspired: dark brown parchment palette, pixel display font, square corners, bevelled panels.

## Key Files

| File         | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tokens.css` | `:root` tokens: `--color-*` palette (background, panel, text, accent, xp, rare, danger, focus, plus the hover and highlight shades and `--color-outline`, `--color-bevel` and `--color-track`, all pure black, for outlines, hard drop shadows and meter tracks), spacing `--space-0-5` (2px), `--space-1` (4px), `--space-1-5` (6px), `--space-2` (8px), `--space-2-5` (10px), `--space-3` (12px), `--space-4` (16px) and `--space-6` (24px) (no `--space-5`), `--font-family` (IBM Plex Mono) and `--font-display` (Pixelify Sans), the type scale `--font-size-2xs` (0.75rem) through `--font-size-4xl` (2rem), `--border-width`, `--radius: 0`, `--tap-target: 44px`, `--tab-bar-height: 70px` (the fixed tab bar without the safe area; `.tab`, `.active-workout-bar` and `.finish-bar` derive from it, so change it with the tab bar's padding), bevel and text-shadow recipes |
| `app.css`    | Global rules and component classes: base elements (`html` sets `touch-action: manipulation` against double-tap zoom, and `html, body` set `overscroll-behavior-y: none` so a workout never pull-to-refreshes or bounces; the tap highlight stays, as buttons have no `:active` style), `.screen`, `.panel`, `.button`, `.tab-bar` (content-sized `minmax(min-content, 1fr)` columns so the longest label, "Collection", keeps its rem size and fits at 320px while the others share the rest), `.segmented`, `.switch`, `.progress-bar`, banners (`.app-banner`), workout, reveal, history and friends layouts; `@keyframes gain-fill`, `pop`, `rise`, `chest-wiggle` (the reveal's idle loot chest); `.reveal-still` turns the reveal's `rise`, `pop` and `gain-added` animations off once it is skipped or settled; one `prefers-reduced-motion` block at the end                  |

## For AI Agents

### Working In This Directory

- Use tokens (`var(--color-*)`, `var(--space-*)`, `var(--font-size-*)`) rather than literal colours and sizes. New colours go into `tokens.css` first; `app.css` has no hex literals. Use a spacing or type token when one is within about 1px of the value you need. The raw values left in `app.css` are deliberate one-offs: display sizes for the brand, reveal total, profile badge, standing and skill level numbers (1.6rem to 2.9rem), `0.65rem` in the drop badge, `10px` in the chart SVG, pixel geometry such as the switch knob offsets, and the translucent `rgb(0 0 0 / x%)` dialog backdrops.
- Text floor: data text (set and effort labels, record chips, last-set and XP lines, hints, input captions, `.tiny`) is never smaller than `--font-size-xs` (0.8125rem, 13px). `--font-size-2xs` (0.75rem) is only for decorative captions next to an icon or inside a field that already has an accessible name: the tab bar labels, the stepped set row's in-field `kg`/`reps` captions and the record slot sub-labels. The stepped set row fits at 360px with this floor because `.plate-marker` and `.set-info > .set-xp` use a `--space-1` gap and `.set-row .effort-option` has no side padding and `-0.02em` letter spacing; widen any of those and the XP line wraps or `Failure` clips.
- Interactive targets use `min-height`/`min-width: var(--tap-target)` (44px). Keep that on any new button, link or row.
- Honour safe areas (`env(safe-area-inset-*)`) on full-width chrome, as `body`, `.screen` and the licenses page do.
- Wrap new animation in the existing `prefers-reduced-motion: reduce` block at the end of `app.css`.
- `--color-art-rare` and `--color-art-danger` hold the pixel-art shades that `../components/pixel-sprites.ts` paints with (`RARE`, `DANGER`). They stay at the original values when the text tokens `--color-rare` and `--color-danger` were lifted for contrast, because `tests/web/pixel-sprites.test.ts` only lets sprites use colours listed in `tokens.css`. Change both together.
- `tokens.css` is parsed by a test: only `--name: #hex;` declarations are read for contrast checks, so keep colour tokens as plain hex literals.
- Class names are the contract with TSX files in `../components/`, `../features/` and `../pwa/`. Rename in both places, and check `e2e/` selectors that use class names.
- The licenses page (`web/public/licenses/index.html`) duplicates a few token values inline because it does not load these files. Keep them in sync with `--color-background`, `--color-panel`, `--color-text` and `--color-accent`.

### Testing Requirements

- `tests/web/contrast.test.ts` reads `tokens.css` and asserts WCAG contrast for every text token on every surface (`--color-backdrop`, `--color-background`, `--color-background-dots`, `--color-panel`, `--color-panel-shade`, `--color-chrome`, `--color-well`): 4.5:1 for all body text, and 5:1 headroom for the secondary text tokens (`--color-text-muted`, `--color-text-faint`, `--color-rare`, `--color-danger`), which sit closest to the floor on `--color-panel`. Add a failing contrast case there before changing a colour token (`make test-web`, no stack).
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
