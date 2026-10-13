# Skills Feature

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

The Skills tab: the eight OSRS-style skills (six lifting skills plus Endurance and Agility) with level, XP and progress to the next level, plus total level. A skill with `combat_weight` 0 reads "does not count toward combat".

## Key Files

| File                | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SkillsScreen.tsx`  | Route `/skills`. Reads standing via `useStanding(userId)` (the saved standing at once while offline, with `Offline: using your saved skills.`), computes progress with `xpForLevel` and `MAX_LEVEL` from `@domain/index.ts`, renders `SkillIcon` and `ProgressBar`, formats with `formatXp` from `../../lib/format.ts`. The picked skill's panel keeps `aria-live` on the XP lines only and lists the exercises that train it (`exercisesTrainingSkill` over `useActiveExercises` from `../../lib/skill-map.ts`), with a `role="status"` loading line, an empty state and a `role="alert"` problem                                                                                    |
| `RecoveryPanel.tsx` | The `Recovery` panel (`aria-labelledby` heading) between the totals and the skill grid. Reads `recentSetsQuery(userId)` and `exerciseListQuery(userId)` (skill shares), computes `recoveryBySkill` at `now` = the later of the mount time and the recent sets' `dataUpdatedAt`, and `recoveryGroups` (names from `SkillsScreen`'s `nameOf`); renders `BodyMap`, a legend of `Recovering`, `Almost fresh` and `Fresh` with the skill names (empty groups left out) and the caption `Hard sets each muscle took in the last week, fading by half every day and a half.` Renders nothing while loading; on a load error it shows `Recovery needs a connection to load your recent sets.` |

## For AI Agents

### Working In This Directory

- Level math is the domain's (`@domain`); never re-derive thresholds here. Standing data comes from `../../lib/standing.ts`; the panel's exercise list comes from `../../lib/skill-map.ts`.
- The skill icons are pixel sprites (`../../components/pixel-sprites.ts`); a11y asserts they render for all eight skills.

### Testing Requirements

- E2E (stack needed): `e2e/a11y.spec.ts` ("the skills screen shows pixel art for the eight skills", plus the every-screen axe test). Level thresholds are tested in `tests/domain/`; sprite output in `tests/web/pixel-sprites.test.ts`. The Recovery panel is covered by `e2e/recovery-and-companion.spec.ts` and its rules by `tests/web/recovery-rules.test.ts`.

### Common Patterns

- Presentation only, no local state beyond the picked skill; data comes from `useStanding` and, once a panel opens, `useActiveExercises`.

## Dependencies

### Internal

- `../../lib/{format,queries,recovery-rules,standing}.ts`, `../../components/{BodyMap,PixelArt,ProgressBar}.tsx`, `@domain/index.ts`.

### External

- React.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
