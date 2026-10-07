# components

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-01

## Purpose

Small shared UI pieces used across feature screens: the line icon set, the pixel-art sprite renderer and its sprite data, a progress bar, a segmented sub-navigation, an accessible switch, and the provider that holds unit and effort-input preferences.

## Key Files

| File                      | Description                                                                                                                                                                                                                                                                                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Icon.tsx`                | `Icon` SVG stroke icons from a `PATHS` record keyed by `IconName` (train, skills, log, friends, search, check, pin, sync, chevron, profile). Add a name and its path here to extend the set                                                                                                                                                                |
| `PixelArt.tsx`            | `PixelGrid` (internal) draws a `Sprite` as crisp-edge SVG rects. Exports `LogoMark`, `TrophyIcon`, `ItemIcon`, `SkillIcon` (falls back to a text monogram for unknown skill keys) and `LevelUpIcon`                                                                                                                                                        |
| `pixel-sprites.ts`        | Pure sprite data and helpers: `Sprite`/`Pixel` types, `SKILL_SPRITES`, `LEVEL_UP`, `LOGO`, `TROPHY`, `itemSprite(kind, color)`, `isSkillKey`, `APP_ICON_BACKGROUND`, `APP_ICON_FRAME`. Also consumed by `scripts/icons/render.ts`                                                                                                                          |
| `PreferencesProvider.tsx` | Provides `PreferencesContext` (unit preference, effort input mode): seeds from the per-user cache, refreshes from `fetchProfile`, ignores the server result if the user changed preferences locally meanwhile, and caches changes                                                                                                                          |
| `ProgressBar.tsx`         | `role="progressbar"` bar; clamps `fraction` to 0..1 and exposes a rounded percent                                                                                                                                                                                                                                                                          |
| `SegmentedNav.tsx`        | `nav.segmented` of `NavLink`s (`end` matching) for sub-areas such as the Log and Friends tabs                                                                                                                                                                                                                                                              |
| `SegmentedChoice.tsx`     | `role="radiogroup"` of `role="radio"` buttons in the `.segmented` style, optionally `stacked` in one column; used by the program enroll form and the Day picker                                                                                                                                                                                            |
| `ConfirmDialog.tsx`       | In-app confirmation on a native `<dialog>` opened with `showModal` (focus moves inside and stays there, Escape cancels), labelled by its heading, with Cancel and a confirm button; used instead of `window.confirm` on the program screens                                                                                                                |
| `ScreenSkeleton.tsx`      | `ScreenSkeleton({ title, panels, tiles })` full-screen placeholder (`aria-busy` `main`, the real `h1` when given) and `ListSkeleton` for screens that render their own heading; both keep a visually hidden `role="status"` "Loading…" that e2e waits on                                                                                                   |
| `Switch.tsx`              | `role="switch"` button with label and optional hint wired through `aria-labelledby`/`aria-describedby`                                                                                                                                                                                                                                                     |
| `LineChart.tsx`           | `LineChart({ title, series, formatX, formatY, minYStep })` (`minYStep` 1 keeps whole-number series on whole ticks): an SVG line chart in a `figure` with a legend; the SVG is `role="img"` named by `title` plus `chartSummary`; geometry from `lib/line-chart-rules.ts`; up to two series styled `series-0` (accent, solid) and `series-1` (rare, dashed) |

## For AI Agents

### Working In This Directory

- `pixel-sprites.ts` feeds the generated icons in `web/public/`. After changing `LOGO`, `APP_ICON_BACKGROUND` or `APP_ICON_FRAME`, run `make icons` and commit the regenerated files; `make check` fails otherwise.
- `ItemIconKind` is `ItemIconKey` from `@domain/crafting.ts` plus `'locked'`. A new domain item icon needs a sprite here (the sprite test iterates `ITEM_ICON_KINDS`).
- Decorative SVGs are `aria-hidden`. Meaningful labels belong on the surrounding element.
- Colours come from `styles/tokens.css` custom properties through class names; sprite hex values are the exception and live in `pixel-sprites.ts`.
- `PreferencesProvider` imports from `../lib/preferences.ts` and `../lib/profile.ts`; keep storage and network logic there.

### Testing Requirements

- `tests/web/pixel-sprites.test.ts` covers sprite data (add the failing case there).
- `tests/web/png.test.ts` covers icon rendering that uses the sprites.
- The React components themselves have no unit tests; they are exercised through `e2e/a11y.spec.ts` and the feature specs (`make e2e`, needs the stack). A new accessibility behaviour goes in `e2e/a11y.spec.ts`.

### Common Patterns

- Props interfaces are declared next to the component and not exported.
- Presentational components take plain props and carry no data fetching, except `PreferencesProvider`.

## Dependencies

### Internal

- `../lib/preferences.ts`, `../lib/profile.ts`, `../lib/standing-rules.ts` (`monogramFor`), `@domain/crafting.ts`
- Class names defined in `../styles/app.css`

### External

- `react`, `react-router-dom`

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
