# Skills Feature

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-01

## Purpose

The Skills tab: the eight OSRS-style skills (six lifting skills plus Endurance and Agility) with level, XP and progress to the next level, plus total level. A skill with `combat_weight` 0 reads "does not count toward combat".

## Key Files

| File               | Description                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SkillsScreen.tsx` | Route `/skills`. Reads standing via `useStanding(userId)`, computes progress with `xpForLevel` and `MAX_LEVEL` from `@domain/index.ts`, renders `SkillIcon` and `ProgressBar`, formats with `formatXp` from `../../lib/format.ts`. The picked skill's panel keeps `aria-live` on the XP lines only and lists the exercises that train it (`exercisesTrainingSkill` over `useActiveExercises`), with an empty state and a `role="alert"` problem |

## For AI Agents

### Working In This Directory

- Level math is the domain's (`@domain`); never re-derive thresholds here. Standing data comes from `../../lib/standing.ts`.
- The skill icons are pixel sprites (`../../components/pixel-sprites.ts`); a11y asserts they render for all eight skills.

### Testing Requirements

- E2E (stack needed): `e2e/a11y.spec.ts` ("the skills screen shows pixel art for the eight skills", plus the every-screen axe test). Level thresholds are tested in `tests/domain/`; sprite output in `tests/web/pixel-sprites.test.ts`.

### Common Patterns

- Presentation only, no local state beyond the picked skill; data comes from `useStanding` and, once a panel opens, `useActiveExercises`.

## Dependencies

### Internal

- `../../lib/{format,standing}.ts`, `../../components/{PixelArt,ProgressBar}.tsx`, `@domain/index.ts`.

### External

- React.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
