# Summary Feature

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-01

## Purpose

The post-workout reveal: XP per skill, level-ups, personal records and loot drops from the server's `SessionSummary`, and the small session-scoped memory that lets other screens re-find that summary.

## Key Files

| File               | Description                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RevealScreen.tsx` | Route `/reveal`. Takes the summary from router `location.state` or `recallLastSummary()`; if absent or stale it can refetch with `fetchSession`. Computes level bars with `levelProgress`, writes lift and cardio records through `describeRecord`, shows `LevelUpIcon`, `TrophyIcon`, `ItemIcon`, marks the PWA install card due via `markInstallCardDue`, links to `/skills`, `/collection/items` and `/` |
| `last-summary.ts`  | `rememberLastSummary`, `recallLastSummary`, `forgetLastSummary(sessionIds)`; stores JSON in `sessionStorage` under `gainscape.last-summary`; every access is try/catch guarded; forget only clears when the cached `sessionId` is in the list                                                                                                                                                               |
| `reveal-rules.ts`  | Pure `describeRecord(record, exercise, unit)`: headline and previous-value text for a personal record (cardio via `describeCardioGains`, bodyweight reps, or load via `formatLoad`)                                                                                                                                                                                                                         |

## For AI Agents

### Working In This Directory

- The reveal must respect reduced motion; `e2e/a11y.spec.ts` asserts no animation under `prefers-reduced-motion`.
- `forgetLastSummary` is called from history delete/edit flows (`../history/SessionDetailScreen.tsx`) so a removed session is not revealed. Keep that coupling when changing keys.
- Summary shape (`SessionSummary`, `DropSummary`, `PersonalRecordSummary`) is defined in `@domain/types.ts` and produced by `complete-session`.

### Testing Requirements

- E2E (stack needed): `e2e/loot.spec.ts` (loot on the reveal), `e2e/a11y.spec.ts` (reduced motion), `e2e/drafts.spec.ts` and `e2e/programs.spec.ts` (finishing leads to the reveal).
- Unit: `tests/web/last-summary.test.ts` (storage stubbed with `tests/web/memory-storage.ts`) and `tests/web/reveal-rules.test.ts` (`make test-web`).

### Common Patterns

- Storage access wrapped in try/catch with a null fallback.

## Dependencies

### Internal

- `../../lib/{cardio-rules,catalog,catalog-rules,format,history,item-rules,items,preferences,profile-rules,units}.ts`, `../../components/PixelArt.tsx`, `../../pwa/install.ts`, `@domain/{index,types}.ts`.

### External

- React Router.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
