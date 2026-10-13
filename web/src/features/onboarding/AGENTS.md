# Onboarding Feature

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-12 · **Updated:** 2026-10-13

## Purpose

The first-run flow for a brand-new user. Train (`../workout/WorkoutScreen.tsx`) opens it as a modal dialog when the user has no draft, no finished workout and no enrollment, and has not finished or skipped it on this device. Three steps: what you earn, weight units, and how to train (StrongLifts 5x5, browse programs, or an empty workout).

## Map

- `use-onboarding.ts`: decides whether to show it. `FirstRunDialog.tsx`: the dialog.
- Decisions in `../../lib/profile/onboarding-rules.ts`, the done flag in `../../lib/profile/onboarding-store.ts` (forgotten by `forgetUserDeviceData`), the history query in `../../lib/profile/onboarding.ts`. Keep these files wiring and markup.

## Rules and gotchas

- The done flag is per device and per user. A user who already trains is recorded as done on the first check, so the history query runs at most once per device.
- The history query refetches on each mount but not on focus or reconnect, so a stale answer never opens the intro and an open intro never closes under the user.
- `Skip intro` and Escape both call `onSkip`; every choice calls `onFinish` first. The step heading takes focus on every step.
- The units step saves through `updatePrivateProfile`, then writes the unit into the saved device profile and the loaded `profileQuery` (so Settings shows it at once) and announces `profile-saved`. It ignores taps while a save runs and reverts on failure.
- `Follow StrongLifts 5x5` shows only when the template is enrollable.
- Card texts come from `GLOSSARY`, the only home of jargon help text.

## Testing

- Unit (`make test-web`): `tests/web/onboarding-rules.test.ts`, `onboarding-store.test.ts`.
- E2E (stack): `e2e/onboarding.spec.ts`. `register` in `e2e/support/app.ts` marks the intro done; use `registerWithoutSigningIn` plus `submitSignIn` to see it.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
