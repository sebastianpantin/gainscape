# Exercises Feature

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-01

## Purpose

Browse the exercise catalog and create, edit or archive the user's custom exercises, including how a custom exercise's XP is split across skills.

## Key Files

| File                     | Description                                                                                                                                                                                                                                                                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ExercisesScreen.tsx`    | Route `/exercises` (takes `userId`). Lists exercises and skills (offline: the saved exercise list and saved skills at once, with `Offline: using your saved exercise list.`), archives via `setCustomExerciseArchived`; opens the form directly when `?new=1` is present (the Train tab links to `/exercises?new=1`) and then clears the param |
| `CustomExerciseForm.tsx` | Create/edit form. Validates the name with `nameProblem`/`trimmedName`, picks the kind (Lift or Cardio, only when creating; modality never changes), `EQUIPMENT`, `LOAD_TYPES` (lift only) and the skills of that kind, saves with `saveCustomExercise`, loads shares with `fetchExerciseShares`, and locks load type once `hasLoggedSet`       |
| `share-form.ts`          | Pure helpers: `BASIS_POINTS_PER_PERCENT` (100), `percentsFromShares`, `shareTotal`, `sharesToSave` (returns `null` when the total is not valid or a `soloSkills` skill, Mobility, is mixed with another), `mixedSoloShareText`, `skillsForModality`. Converts between percent strings and `SkillShare` basis points                            |

## For AI Agents

### Working In This Directory

- Shares are stored in basis points; the form shows percents. Keep conversion only in `share-form.ts`.
- Name rules are shared with programs via `../../lib/names.ts`.
- Custom exercise persistence is in `../../lib/custom-exercises.ts`; database rules back it, so schema changes need a migration and hand-updated row types in that module.

### Testing Requirements

- Unit: `tests/web/share-form.test.ts` and `tests/web/names.test.ts` (`make test-web`). Add share math cases to `share-form.test.ts` first.
- E2E (stack needed): `e2e/custom-exercise.spec.ts` (create, log, record, pin, reorder, archive) and `e2e/a11y.spec.ts`.

### Common Patterns

- Form state is kept as strings and parsed on save; `sharesToSave` is the gate for enabling save.

## Dependencies

### Internal

- `../../lib/{catalog,catalog-rules,custom-exercises,error-text,names}.ts`.

### External

- React Router (`useSearchParams`).

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
