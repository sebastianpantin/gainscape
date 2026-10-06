# Features

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-01

## Purpose

Feature-sliced screens of the Gainscape PWA. Each subdirectory owns one area of the UI (auth, workout logging, history, collection, friends, profile, programs, exercises, skills, reveal summary). Screens are React components named `*Screen`, exported by name, and mounted by `web/src/App.tsx`. Data access, formatting and decisions live in `../lib/`, `../offline/` and the shared domain engine, so feature files stay mostly wiring and markup.

## Subdirectories

| Directory     | Purpose                                                                                 |
| ------------- | --------------------------------------------------------------------------------------- |
| `auth/`       | Sign-in, register, reset and email-link callback screens (see `auth/AGENTS.md`)         |
| `collection/` | Records, items/crafting; hosts the shared `CollectionTabs` (see `collection/AGENTS.md`) |
| `exercises/`  | Exercise list and custom-exercise form (see `exercises/AGENTS.md`)                      |
| `friends/`    | Feed, hiscores, friend profile (see `friends/AGENTS.md`)                                |
| `history/`    | Session list, detail and edit flow (see `history/AGENTS.md`)                            |
| `profile/`    | Profile, edit, friend preview, settings (see `profile/AGENTS.md`)                       |
| `programs/`   | Program list and editor (see `programs/AGENTS.md`)                                      |
| `skills/`     | Skill levels screen (see `skills/AGENTS.md`)                                            |
| `summary/`    | Post-workout reveal and last-summary memory (see `summary/AGENTS.md`)                   |
| `workout/`    | The Train tab: draft logging, set rows, finish sync (see `workout/AGENTS.md`)           |

## For AI Agents

### Working In This Directory

- Routing is wired in `web/src/App.tsx`. `Screens` renders `AuthCallbackScreen` when `parseAuthCallback(window.location.href)` matches, `AuthScreen` when signed out, otherwise `PreferencesProvider` plus `BrowserRouter` with a bottom `TABS` nav (Train `/`, Skills, Log `/collection`, Friends, Profile) and these routes: `/` Workout, `/reveal`, `/skills`, `/collection`, `/collection/items`, `/collection/exercises/:exerciseId`, `/collection/history`, `/collection/history/:sessionId`, `/friends`, `/friends/hiscores`, `/friends/:friendId`, `/profile`, `/profile/edit`, `/profile/preview`, `/profile/settings`, `/exercises`, `/programs`, `/programs/:programId`, and `*` redirecting to `/`. A new screen needs an import and a `Route` there, plus a tab or link, and an entry in the every-screen axe test in `e2e/a11y.spec.ts`.
- Screens that need the signed-in user take a `userId` prop from `App.tsx`; `WorkoutScreen` is also keyed by `userId`.
- Put any non-trivial decision in a pure `*-rules.ts` in `../lib/` or a pure `.ts` beside the screen (`session-edit.ts`, `share-form.ts`, `xp-preview.ts`, `last-summary.ts`) and unit test it. Keep `.tsx` files thin.
- Features import each other only for shared widgets: `workout/ExercisePicker`, `workout/SetRow`, `workout/EffortSelector`, `workout/xp-preview`, `collection/CollectionScreen` (`CollectionTabs`), `profile/ProfileCard`, `summary/last-summary`. Prefer extending those over duplicating.
- No comments in code; imports keep the `.ts`/`.tsx` extension; domain code is imported through the `@domain/*` alias.

### Testing Requirements

- Pure feature modules are unit tested in `tests/web/` with `make test-web`: `session-edit.ts` by `tests/web/session-edit.test.ts`, `share-form.ts` by `tests/web/share-form.test.ts`. No other file in this tree is imported by `tests/`.
- Screens are covered only by Playwright specs in `e2e/` (`make e2e`, stack required). The per-feature specs are listed in each subdirectory's AGENTS.md; `e2e/a11y.spec.ts` visits every signed-in screen.
- Write the failing test first in the lowest layer that can express it: extract logic to a pure module and test it in `tests/web/`, otherwise add a flow to the matching `e2e/*.spec.ts`.

### Common Patterns

- Screens fetch in `useEffect`, hold a tagged state (`{ status: 'loading' | 'ready' | ... }`) and render loading, error and ready branches.
- `usePreferences()` supplies unit and effort-input preferences; weights are stored in kg and converted with `../lib/units.ts` only for display and input.
- Tabs inside a section use `SegmentedNav` (`CollectionTabs`, `FriendsTabs`).

## Dependencies

### Internal

- `../lib/` (Supabase calls and rules), `../offline/` (drafts, sync), `../components/`, `../pwa/`, `@domain/*`.

### External

- React 19, React Router 7 (`Link`, `useNavigate`, `useParams`, `useLocation`, `useSearchParams`).

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
