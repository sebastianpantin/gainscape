# Features

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-14

## Purpose

Feature-sliced screens of the PWA. Each subdirectory owns one area of the UI (auth, collection, design (DEV-only gallery), exercises, friends, history, onboarding, profile, programs, quests, skills, stats, summary, what's new, workout) and has its own `AGENTS.md`. Screens are `*Screen` components mounted by `web/src/App.tsx`. Data access, formatting and decisions live in `../lib/`, `../offline/` and the shared domain, so feature files stay mostly wiring and markup.

## Rules and gotchas

- Routes live only in `web/src/App.tsx`. A new screen needs a lazy import and a `Route` there, a tab or link, and an entry in the every-screen axe test in `e2e/a11y.spec.ts`.
- Screens that need the signed-in user take a `userId` prop; `WorkoutScreen` is also keyed by it.
- Put any non-trivial decision in a pure `*-rules.ts` in `../lib/` or a pure `.ts` beside the screen, and unit test it. Keep `.tsx` files thin.
- Features import each other only for shared widgets (`workout/ExercisePicker`, `workout/SetRow`, `workout/EffortSelector`, `collection/CollectionScreen`'s `CollectionTabs`, `profile/ProfileCard`). Extend those rather than duplicating.
- Weights are stored in kg and converted with `../lib/units.ts` only for display and input (`usePreferences()`).

## Testing

- Pure feature modules: `tests/web/` (`make test-web`).
- Screens: Playwright specs in `e2e/` (`make e2e`, stack). Write the failing test in the lowest layer that can express it.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
