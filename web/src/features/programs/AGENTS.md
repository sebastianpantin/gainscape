# Programs Feature

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-01

## Purpose

Training programs: list, copy from templates, create, rename and edit days with planned exercises and sets. A program day can be started from the Train tab (see `workout/ProgramDayStarts.tsx`).

## Key Files

| File                 | Description                                                                                                                                                                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ProgramsScreen.tsx` | Route `/programs`. Lists own programs and templates via `../../lib/programs.ts`, links to the editor, navigates after creating or copying                                                                                                          |
| `ProgramEditor.tsx`  | Route `/programs/:programId`. Edits a `ProgramDoc` (days of `PlannedExercise`), validates names with `nameProblem`/`trimmedName`, loads cached programs first via `cachedPrograms`, saves with `saveProgram`, adds exercises with `ExercisePicker` |

## For AI Agents

### Working In This Directory

- `PlannedExercise` is defined in `../../offline/draft-format.ts` and is what a started day copies into the draft; changing its shape means updating draft format versioning and `tests/web/draft-format.test.ts`.
- Program persistence and cache live in `../../lib/programs.ts`. Programs are available offline through that cache.

### Testing Requirements

- E2E (stack needed): `e2e/programs.spec.ts` (copy a template, run a day with planned sets, finish) and `e2e/a11y.spec.ts`.
- Integration: `tests/integration/programs.test.ts`. Unit: `tests/web/names.test.ts`, `tests/web/draft-format.test.ts`. There are no unit tests for the editor logic itself; extract it to a pure module and test in `tests/web/` when adding rules.

### Common Patterns

- Cache-first load then network refresh.

## Dependencies

### Internal

- `../../lib/{catalog,names,programs}.ts`, `../../offline/draft-format.ts`, `../workout/ExercisePicker.tsx`.

### External

- React Router.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
