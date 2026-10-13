# Exercises Feature

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

Browse the exercise catalog (`/exercises`) and create, edit or archive the user's custom exercises, including how a custom exercise's XP is split across skills.

## Map

- `ExercisesScreen.tsx`: the list; `?new=1` opens the form directly (the Train tab links there) and then clears the param.
- `CustomExerciseForm.tsx`: the create and edit form.
- `share-form.ts`: pure share math. Persistence is in `../../lib/custom-exercises.ts`.

## Rules and gotchas

- Shares are stored in basis points and shown as percents. Keep the conversion only in `share-form.ts`. `sharesToSave` returns `null` (Save disabled) when the total is wrong or Mobility is mixed with another skill, matching the database rule.
- Modality (Lift or Cardio) is chosen only when creating and never changes. The load type locks once a set is logged, because the database refuses the change.
- Name rules are shared with programs through `../../lib/names.ts`.
- Schema changes need a migration and hand-updated row types in `../../lib/custom-exercises.ts`.
- Offline, the saved exercise list and skills show at once with a notice.

## Testing

- Unit (`make test-web`): `tests/web/share-form.test.ts` (add share cases here first), `names.test.ts`.
- E2E (stack): `e2e/custom-exercise.spec.ts`, `e2e/a11y.spec.ts`.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
