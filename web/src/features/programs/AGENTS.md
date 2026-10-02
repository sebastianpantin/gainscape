# Programs Feature

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-01

## Purpose

Training programs: list, copy from templates, create, rename and edit days with planned exercises and sets. A program day can be started from the Train tab (see `workout/ProgramDayStarts.tsx`). Powerlifting programs (Madcow, 5/3/1) are followed through an enrollment: an enroll form generated from the template definition and a manage screen for training maxes and top sets; today's prescribed workout is on the Train tab (see `workout/ProgramToday.tsx`).

## Key Files

| File                       | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ProgramsScreen.tsx`       | Route `/programs`. Lists own programs and templates via `../../lib/programs.ts`, links to the editor, navigates after creating or copying                                                                                                                                                                                                                                                                                                                        |
| `PowerliftingPrograms.tsx` | The "Powerlifting programs" section of `/programs`: template entries from `templateListEntries` (cache-first from `program-cache.ts`), a "Follow <name>" link to `/programs/enroll/<key>`, or the "Update the app to use this program" text with no link                                                                                                                                                                                                         |
| `ProgramEnrollScreen.tsx`  | Route `/programs/enroll/:key`. The enroll form from `program-enroll-rules.ts`: a "Unit" radiogroup defaulting to the unit preference, input fields with their TM or top set preview, option radiogroups or number inputs, a "<lift> exercise" select per lift with "Not tracked", rounding controls, and "Start following", which calls `enrollProgram`, refreshes the program cache and navigates to `/`. Asks before replacing an active enrollment            |
| `ActiveProgramScreen.tsx`  | Route `/programs/active`. The followed program's reference fields (`referenceFields`); "Save changes" sends one `adjust_enrollment` `set_reference` per changed field, refetches the facts and shows a "Saved" status. Needs a connection                                                                                                                                                                                                                        |
| `use-active-program.ts`    | `useActiveProgram(userId)`: the saved program cache, refreshed with `refreshProgramCache`, folded into an `ActiveProgram` with `activeProgram`; shared with `workout/WorkoutScreen.tsx`                                                                                                                                                                                                                                                                          |
| `ProgramEditor.tsx`        | Route `/programs/:programId`. Edits a `ProgramDoc` (days of `PlannedExercise`) through the pure functions in `program-edit.ts`, loads cached programs first via `cachedPrograms`, saves `trimmedDoc` with `saveProgram`, adds exercises with `ExercisePicker`                                                                                                                                                                                                    |
| `program-edit.ts`          | Pure editor logic: `docFor` (finds the program doc in the cached list), day changes (`renameDay`, `moveDay`, `removeDay`, `addDay`, `canAddDay` with `MAX_DAYS`), exercise changes (`changePlannedExercise`, `movePlannedExercise`, `removePlannedExercise`, `addPlannedExercise`), `nameIssue` (program and day names against `PROGRAM_NAME_MAX_LENGTH`/`DAY_NAME_MAX_LENGTH`), `trimmedDoc`, and the target ranges `TARGET_SETS_RANGE` and `TARGET_REPS_RANGE` |

## For AI Agents

### Working In This Directory

- `PlannedExercise` is defined in `../../offline/draft-format.ts` and is what a started day copies into the draft; changing its shape means updating draft format versioning and `tests/web/draft-format.test.ts`.
- Program persistence and cache live in `../../lib/programs.ts`. Programs are available offline through that cache.

### Testing Requirements

- E2E (stack needed): `e2e/programs.spec.ts` (copy a template, run a day with planned sets, finish), `e2e/program-enrollment.spec.ts` (enroll in Madcow and 5/3/1 BBB, follow today, edit the TM, start offline, stale template) and `e2e/a11y.spec.ts`.
- Unit: `tests/web/program-enroll-rules.test.ts`, `tests/web/program-today-rules.test.ts` and `tests/web/program-reference-rules.test.ts` cover the powerlifting program rules in `../../lib/`.
- Integration: `tests/integration/programs.test.ts`. Unit: `tests/web/program-edit.test.ts` (editor rules), `tests/web/names.test.ts`, `tests/web/draft-format.test.ts`, `tests/web/reorder.test.ts`. Put new editor rules in `program-edit.ts` and test them there first.

### Common Patterns

- Cache-first load then network refresh.

## Dependencies

### Internal

- `../../lib/{catalog,catalog-rules,error-text,names,programs,reorder}.ts`, `../../offline/draft-format.ts`, `../workout/ExercisePicker.tsx`.
- `../../lib/{program-enroll-rules,program-today-rules,program-reference-rules,program-enrollment,preferences}.ts`, `../../offline/{program-cache,program-facts-cache}.ts`, `../../components/SegmentedChoice.tsx`.

### External

- React Router.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
