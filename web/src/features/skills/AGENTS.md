# Skills Feature

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

The Skills tab (`/skills`): every skill's level, XP and progress, total level, the exercises that train a picked skill, and the Recovery panel (a body map of recent hard sets).

## Map

- `SkillsScreen.tsx`: standing from `useStanding(userId)` (`../../lib/progress/standing.ts`), exercises from `../../lib/progress/skill-map.ts`.
- `RecoveryPanel.tsx`: rules in `../../lib/progress/recovery-rules.ts`, drawn with `components/BodyMap.tsx`.

## Rules and gotchas

- Level math comes from the domain (`xpForLevel`, `MAX_LEVEL`); never re-derive thresholds here.
- A skill with `combat_weight` 0 reads "does not count toward combat".
- Offline, the saved standing shows at once with its notice.
- The picked skill's panel keeps `aria-live` on the XP lines only, not on the exercise list.
- Recovery computes at the later of mount time and the recent sets' `dataUpdatedAt`. It renders nothing while loading and needs a connection. The body map's colour is the only state cue in the figure, so the legend must list skill names.
- Recovery here (recent days) is separate from the server's in-session fatigue check.

## Testing

- Unit: `tests/web/recovery-rules.test.ts`; level thresholds in `tests/domain/`; sprites in `tests/web/pixel-sprites.test.ts`.
- E2E (stack): `e2e/a11y.spec.ts` (pixel art for every skill, axe), `e2e/recovery-and-companion.spec.ts`.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
