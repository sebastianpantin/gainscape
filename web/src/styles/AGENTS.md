# styles

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

The whole visual layer. `tokens.css` defines the design tokens as CSS custom properties on `:root`. `app.css` is only an ordered list of `@import`s of the per-area stylesheets, which hold plain class selectors for every screen. `../main.tsx` imports both once. The look is OSRS-inspired: dark brown parchment palette, pixel display font (`--font-display`, Silkscreen) over IBM Plex Mono, square corners (`--radius: 0`), bevelled panels (`var(--bevel)`, `var(--bevel-sunken)`).

## Map

- `tokens.css`: the colour palette, spacing (`--space-0-5` to `--space-6`; there is no `--space-5`), the type scale (`--font-size-2xs` 0.75rem to `--font-size-3xl` 2rem), `--tap-target`, `--tab-bar-height`, and the bevel and text-shadow recipes.
- `app.css` imports, in cascade order: `base.css`, `chrome.css`, `workout.css`, `reveal.css`, `skills.css`, `collection.css`, `friends.css`, `profile.css`, `settings.css`, `history.css`, then `motion.css` (the one `prefers-reduced-motion: reduce` block) last. Import order is cascade order: add a rule to its area file, and add a new file to `app.css` in the right place. Flat class selectors, no preprocessor, no CSS modules.

## Rules and gotchas

- The rules and their reasons are in `../../../docs/design-system.md`; `tests/web/css-rules.test.ts` enforces most of them.
- Use a spacing or type token whenever one is within about 1px of the value you need. The only raw font sizes are the display one-offs listed in `css-rules.test.ts`; pixel geometry such as the switch knob offsets stays raw.
- Keep colour tokens as plain `--name: #hex;` declarations; `contrast.test.ts` parses only 3- or 6-digit hex, so the 8-digit `--color-scrim` and `--color-bevel-light` stay out of it.
- `--color-art-rare` and `--color-art-danger` are the pixel-art shades `../components/pixel-sprites.ts` paints with. They kept their original values when the text tokens `--color-rare` and `--color-danger` were lifted for contrast, because sprites may use only colours listed in `tokens.css`. Change the token and the sprite together.
- `--color-outline`, `--color-bevel` and `--color-track` are all pure black on purpose (outlines, hard drop shadows, meter tracks).
- `--tab-bar-height` (70px, the fixed tab bar without the safe area) drives `.tab`, `.active-workout-bar` and `.finish-bar`. Change it together with the tab bar's padding.
- Text floor:
  - Data text (set and effort labels, record chips, last-set and XP lines, hints, input captions, `.tiny`) never goes below `--font-size-xs` (0.8125rem, 13px).
  - `--font-size-2xs` is only for decorative captions next to an icon or inside a field that already has an accessible name: tab bar labels, the in-field `kg`/`reps` captions of the stepped set row, and record slot sub-labels.
- The stepped set row fits at 360px only because `.plate-marker` and `.set-info > .set-xp` use a `--space-1` gap, and `.set-row .chip` has almost no side padding and `-0.02em` letter spacing. Widen any of these and the XP line wraps or `Failure` clips.
- `.tab-bar` columns are `minmax(min-content, 1fr)`, so the longest label ("Collection") keeps its rem size and fits at 320px.
- `.tap-link` is a 44px-tall box whose negative block margins (`1lh` minus the target) keep the line at its normal height.
- `html` sets `touch-action: manipulation` to stop double-tap zoom. `html, body` set `overscroll-behavior-y: none`, so a workout never pull-to-refreshes or bounces. The tap highlight stays, because buttons have no `:active` style.
- `.route-view`'s `route-enter` is an opacity-only fade. A transform would make it the containing block of its `position: fixed` children.
- `.toast-region` sits fixed above the tab bar, the safe area and the taller of the active workout bar slot and the measured `--finish-bar-height`, with `z-index: 25` and `pointer-events: none`.
- `.reveal-still` turns off the reveal's `rise`, `pop` and `gain-added` animations once the reveal is skipped or settled.
- Put every new animation inside the existing `prefers-reduced-motion: reduce` block in `motion.css`, which `app.css` imports last.
- Class names are the contract with the TSX in `../components/`, `../features/` and `../pwa/`. Rename them in both places and check `e2e/` selectors that use class names.
- Token values are copied elsewhere. Keep these in sync:
  - `web/public/licenses/index.html` has `--color-background`, `--color-panel`, `--color-text` and `--color-accent` inline, because it does not load these files.
  - `web/index.html` (`theme-color`), `web/public/manifest.webmanifest`, and `APP_ICON_BACKGROUND` in `../components/pixel-sprites.ts`.

## Testing

- `tests/web/contrast.test.ts` checks WCAG contrast for every text token on every surface token (`--color-backdrop`, `--color-background`, `--color-background-dots`, `--color-panel`, `--color-panel-current` (the current set row), `--color-panel-shade`, `--color-chrome`, `--color-well`). Body text needs 4.5:1. The secondary tokens (`--color-text-muted`, `--color-text-faint`, `--color-rare`, `--color-danger`) need 5:1. Add a failing case there before changing a colour token (`make test-web`).
- `tests/web/css-rules.test.ts` parses every stylesheet with postcss. Axe scans in `e2e/a11y.spec.ts` (`make e2e`, stack) catch layout and accessibility regressions.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
