# Onboarding Feature

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-12 · **Updated:** 2026-10-12

## Purpose

The first-run flow for a brand-new user. The Train screen (`../workout/WorkoutScreen.tsx`) opens it as a modal dialog when the user has no draft, no finished workout and no program enrollment, and has not finished or skipped it on this device. It has three steps: what you earn (skills and XP, records, loot), weight units, and how to train (follow StrongLifts 5x5, browse programs, or start an empty workout).

## Key Files

| File                 | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `use-onboarding.ts`  | `useOnboarding(userId, hasDraft)` returns `{ open, finish }`. Reads `readOnboarding` once; only when it is `absent` and no draft is open does it run `trainingHistoryQuery` (one own `sessions` row and one own `program_enrollments` row, refetched on each mount but not on focus or reconnect, so a stale answer never opens the intro and an open intro never closes under the user). `trainingHistoryNow` and `onboardingDecision` turn these into `show`, `wait`, `record` (a user who already trains: the done flag is saved, nothing shows) or `hide`. `finish` saves the done flag and closes the dialog                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `FirstRunDialog.tsx` | `FirstRunDialog({ userId, onFinish, onSkip, onFreestyle })`: a native `<dialog>` opened with `showModal`, named by its step heading, with `Step N of 3`, pixel pips and a `Skip intro` button on every step; Escape also skips. Both call `onSkip`, which `WorkoutScreen` uses to finish and move focus to `Start workout`. The step heading takes focus on every step. Steps: `FIRST_RUN_CARDS` as the `What you earn` list with pixel sprites; a `Weight units` `SegmentedChoice` that applies the preference at once and saves it with `updatePrivateProfile`, then writes the unit into the saved device profile and the loaded `profileQuery(userId)` (so Settings shows it at once) and announces `profile-saved` (ignores taps while a save is in flight; reverts and shows a problem on failure); the training choice, where `Follow StrongLifts 5x5` links to `/programs/enroll/stronglifts_5x5` (only when `beginnerProgram` finds it enrollable), `Browse all programs` links to `/programs` and `Start an empty workout` calls `onFreestyle`. Every choice calls `onFinish` first. |

## For AI Agents

### Working In This Directory

- Decisions live in `../../lib/onboarding-rules.ts`; storage in `../../lib/onboarding-store.ts` (forgotten by `forgetUserDeviceData`); the query in `../../lib/onboarding.ts`. Keep these files wiring and markup.
- The card texts come from `GLOSSARY` (`xp`, `pr`, `loot`), the only home of jargon help text. Change the wording there.
- The done flag is per device and per user. A user who already trains is recorded as done on the first check, so the history query runs at most once per device.

### Testing Requirements

- Pure logic: `tests/web/onboarding-rules.test.ts`, `tests/web/onboarding-store.test.ts` (`make test-web`).
- Flow and axe: `e2e/onboarding.spec.ts` (`make e2e`). `register` in `e2e/support/app.ts` marks the intro done so other specs land on a plain Train screen; sign in with `registerWithoutSigningIn` plus `submitSignIn` to see it.

## Dependencies

### Internal

- `../../lib/onboarding-rules.ts`, `../../lib/onboarding-store.ts`, `../../lib/queries.ts` (`trainingHistoryQuery`, `programTemplatesQuery`), `../../lib/program-enroll-rules.ts`, `../../lib/preferences.ts`, `../../lib/profile.ts`, `../../components/PixelArt.tsx`, `../../components/SegmentedChoice.tsx`

### External

- React 19, React Router 7 (`Link`), TanStack Query 5

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
