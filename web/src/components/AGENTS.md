# components

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

Shared UI pieces for feature screens: icons, pixel-art sprites and their renderer, form controls (switch, segmented choice, number field), dialogs, skeletons, the error boundary, toasts, line and bar charts, the body map, jargon help, and the preferences provider.

## Map

- `pixel-sprites.ts` is pure sprite data (no React). `scripts/icons/render.ts` also uses it to generate `web/public/icons/*`. `PixelArt.tsx` renders the sprites.
- `character-sprites.ts`: the 24 by 32 lifter: a body, one overlay per gear slot tinted with the tier colour, four poses (idle, lifting, flexing, resting) of two frames each, and a build. A build never has its own art: `built` removes or doubles one column pair for the arms and one for the frame in every layer, gear included, so gear stays on the body in every build and new art only has to fit the `fit` build inside columns 2 to 21. Hand gear has a second `raised` layer for the flexing pose. `CharacterFigure` (`PixelArt.tsx`) stacks both frames and swaps them in CSS; look, build, pose text and label come from `../lib/collection/character-rules.ts`. Judge art changes in the `/design` gallery.
- `scene-sprites.ts`: the Train gym scene, 176 by 36: a still layer plus two frames for what moves (torch flame, clouds, stars, city lights, snow, the sparkle on a gold trophy). The frames lie above the light tint, so they stay bright at night; keep tinted things in the still layer, and keep moving sky pixels above the skyline and off the window bars. The svg is sliced from the middle, so everything that grows or moves stays inside columns 40 to 136, which a 320 px phone shows, and each piece of skill equipment keeps its own cells (`tests/web/scene-sprites.test.ts`). `GymScene` (`PixelArt.tsx`) renders it; the `/design` gallery shows every stage. On Train (`TrainingHero`) the character, the pet, the quest scroll and the loot chest are links laid over it in `chrome.css` at the columns the sprite leaves free; move art and links together and keep their 44 px targets apart. What the scene holds is decided in `../lib/progress/scene-rules.ts`. Pet mood and character pose (`../features/workout/pet-mood-rules.ts`, `character-pose-rules.ts`) count profile-timezone days since the last workout, from the training days or else `lastWorkoutDateQuery` (online only), and stay unknown until loaded, so `sleepy` and `resting` never flash. `useSceneGrowth` says "Your gym grew" once per stage and per piece of equipment per device, never on a first visit.
- `Icon.tsx`: line icons in a `PATHS` record. To add an icon, add a name and its path there.
- Providers wrapping the app in `App.tsx`: `PreferencesProvider.tsx` (unit and effort mode) and `ToastProvider.tsx` (inside the data router from `createBrowserRouter`). `ScreenErrorBoundary.tsx` wraps the routes.
- Their decisions live in `../lib/ui/*-rules.ts` (the bar chart shares the line chart's frame, ticks and styles) and `glossary.ts`.

## Rules and gotchas

- After changing `LOGO`, `APP_ICON_BACKGROUND` or `APP_ICON_FRAME` in `pixel-sprites.ts`, run `make icons` and commit the output, or `make check` fails.
- `ItemIconKind` is `ItemIconKey` from `@domain/crafting.ts` plus `'locked'`. A new domain item icon needs a sprite here; the sprite test iterates `ITEM_ICON_KINDS`.
- Sprite hex values are the only colour literals outside `styles/tokens.css`, and they must be colours listed in `tokens.css` (`tests/web/pixel-sprites.test.ts`, `tests/web/character-sprites.test.ts`, `tests/web/scene-sprites.test.ts`). Tints passed in (tier and badge colours) are the exception. Everything else gets its colour from token classes.
- Decorative SVGs are `aria-hidden`; put the meaningful label on the surrounding element.
- `BodyMap` colour is the only state cue in the figure, so the screen must also list the names (`RecoveryPanel`).
- `CountUp` and `ShownNumber` hide the animated text from assistive tech (`aria-hidden`) and put the final value in a visually hidden span, so screen readers and e2e names never read the running count. `ProgressBar`'s `shownFraction` moves only the fill; `aria-valuenow` and `aria-valuetext` stay on the real value.
- `ToastProvider` always renders the `toast-region` (`role="status"`, `aria-live="polite"`), so screen readers register it before the first toast. Because of that, an e2e `getByRole('status')` also matches it: assert exact text inside a status, not the whole status. `addToast` (`lib/ui/toast-rules.ts`) keeps earlier toasts that carry an action and replaces plain ones; each toast runs its own timer, and one raised right after a keypress gets a Dismiss button and no timer.
- `ScreenSkeleton` renders an `aria-busy` `main`, which route focus waits on, and a visually hidden "Loading…" status that e2e waits on. Keep both.
- `ScreenErrorBoundary` catches a lazy chunk that fails to load and resets when the pathname changes.
- `useUnsavedChangesGuard(dirty)` (`UnsavedChangesGuard.tsx`) needs the data router for `useBlocker`. Render its `prompt`, and call `allowLeaving()` right before navigating away after a successful save or delete, or the prompt blocks it. While dirty it also adds a `beforeunload` prompt for a reload or a closed tab; `allowLeaving()` skips that too.
- When to use each state and dialog component: `../../../docs/design-system.md` (the `/design` route renders them). Failed actions stay inline alerts.
- `ConfirmDialog` uses a native `<dialog>` with `showModal` (keeps focus inside, Escape cancels, focus returns to the opener). Use it instead of `window.confirm`.
- `SegmentedChoice` is every one-of-a-few radiogroup: one tab stop, arrow keys move and pick.
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
  - Enter moves to the next `NumberTextField` in document order; with `lastInGroup` it stays put, or calls `onDone` when the text is the saved value (the live set row focuses its Done).
- `PreferencesProvider` reads `preferencesQuery` (a `select` over the cached profile). A local change wins until the loaded preferences match it (`pendingLocalPreferences`), so an older profile answer cannot undo it. Keep storage and network logic in `../lib/profile/preferences.ts` and `../lib/profile/profile.ts`.
- Components take plain props and fetch no data (except `PreferencesProvider`, through the query cache). Props interfaces sit next to the component and are not exported.

## Testing

- `tests/web/pixel-sprites.test.ts` and `tests/web/character-sprites.test.ts` cover the sprite data, and `tests/web/png.test.ts` covers icon rendering (`make test-web`).
- The components themselves have no unit tests. `e2e/a11y.spec.ts` and the feature specs exercise them (`make e2e`, needs the stack). New accessibility behaviour goes in `e2e/a11y.spec.ts`.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
