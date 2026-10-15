# components

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

Small shared UI pieces used across feature screens: icons, the pixel-art sprites and their renderer, form controls (switch, segmented choice, number field), dialogs, skeletons, the error boundary, toasts, the line chart, the body map, jargon help, and the preferences provider.

## Map

- `pixel-sprites.ts` is pure sprite data (no React). `scripts/icons/render.ts` also uses it to generate `web/public/icons/*`. `PixelArt.tsx` renders the sprites.
- `Icon.tsx`: line icons in a `PATHS` record. To add an icon, add a name and its path there.
- Providers wrapping the app in `App.tsx`: `PreferencesProvider.tsx` (unit and effort mode) and `ToastProvider.tsx` (inside the `BrowserRouter`). `ScreenErrorBoundary.tsx` wraps the routes.
- The decisions behind these components live in `../lib/ui/`: `number-field-rules.ts`, `count-up-rules.ts`, `toast-rules.ts`, `line-chart-rules.ts`, `glossary.ts` and `term-help-rules.ts`.

## Rules and gotchas

- After changing `LOGO`, `APP_ICON_BACKGROUND` or `APP_ICON_FRAME` in `pixel-sprites.ts`, run `make icons` and commit the regenerated files. `make check` fails otherwise.
- `ItemIconKind` is `ItemIconKey` from `@domain/crafting.ts` plus `'locked'`. A new domain item icon needs a sprite here; the sprite test iterates `ITEM_ICON_KINDS`.
- Sprite hex values are the only colour literals outside `styles/tokens.css`, and they must be colours listed in `tokens.css` (`tests/web/pixel-sprites.test.ts`). Everything else gets its colour from token classes.
- Decorative SVGs are `aria-hidden`; put the meaningful label on the surrounding element.
- `BodyMap` colour is the only state cue in the figure, so the screen must also list the names (`RecoveryPanel`).
- `CountUp` hides the animated text from assistive tech (`aria-hidden`) and puts the final value in a visually hidden span, so screen readers never read the running count.
- `ToastProvider` always renders the `toast-region` (`role="status"`, `aria-live="polite"`), so screen readers register it before the first toast. Because of that, an e2e `getByRole('status')` also matches it: assert exact text inside a status, not the whole status.
- `ScreenSkeleton` renders an `aria-busy` `main`, which route focus waits on, and a visually hidden "Loading…" status that e2e waits on. Keep both.
- `ScreenErrorBoundary` catches a lazy chunk that fails to load and resets when the pathname changes.
- `ConfirmDialog` uses a native `<dialog>` with `showModal` (keeps focus inside, Escape cancels). Use it instead of `window.confirm`.
- `TermHelp`:
  - It uses a native `popover="auto"`, shown in the top layer and pinned to the top edge, so opening it shifts nothing and it stays clear of the finish bar and tab bar. The button is hidden where `:popover-open` is unsupported.
  - Place it next to the term in a `.row` or after a heading, never inside a label or a set row.
  - Decide which keys a screen shows in a pure rule (`../lib/ui/term-help-rules.ts`, `../features/workout/workout-help.ts`).
  - In e2e, locate the button by its `question` and check the panel by visibility, not by `aria-expanded`.
- `NumberTextField`:
  - It keeps the typed text while focused and reads a comma as a decimal point.
  - It commits each readable value clamped to its bounds.
  - It flags text that differs from the saved value (`aria-invalid`, plus a "Saved as" hint announced once).
  - Focus selects the whole value, again on the first mouseup so a tap keeps the selection.
  - Enter moves to the next `NumberTextField` in document order; with `lastInGroup` it stays put.
- `PreferencesProvider` reads `preferencesQuery` (a `select` over the cached profile). A local change wins until the loaded preferences match it (`pendingLocalPreferences`), so an older profile answer cannot undo it. Keep storage and network logic in `../lib/profile/preferences.ts` and `../lib/profile/profile.ts`.
- Components take plain props and fetch no data (except `PreferencesProvider`, through the query cache). Props interfaces sit next to the component and are not exported.

## Testing

- `tests/web/pixel-sprites.test.ts` covers the sprite data, and `tests/web/png.test.ts` covers icon rendering (`make test-web`).
- The components themselves have no unit tests. `e2e/a11y.spec.ts` and the feature specs exercise them (`make e2e`, needs the stack). New accessibility behaviour goes in `e2e/a11y.spec.ts`.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
