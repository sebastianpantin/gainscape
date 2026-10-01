# Summary Feature

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-01

## Purpose

The post-workout reveal: XP per skill, level-ups, personal records and loot drops from the server's `SessionSummary`, and the small session-scoped memory that lets other screens re-find that summary.

## Key Files

| File               | Description                                                                                                                                                                                                                                                                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RevealScreen.tsx` | Route `/reveal`. Takes the summary from router `location.state` or `recallLastSummary()`; if absent or stale it can refetch with `fetchSession`. Computes level bars with `levelProgress`, shows `LevelUpIcon`, `TrophyIcon`, `ItemIcon`, marks the PWA install card due via `markInstallCardDue`, links to `/skills`, `/collection/items` and `/` |
| `last-summary.ts`  | `rememberLastSummary`, `recallLastSummary`, `forgetLastSummary(sessionIds)`; stores JSON in `sessionStorage` under `gainscape.last-summary`; every access is try/catch guarded; forget only clears when the cached `sessionId` is in the list                                                                                                      |

## For AI Agents

### Working In This Directory

- The reveal must respect reduced motion; `e2e/a11y.spec.ts` asserts no animation under `prefers-reduced-motion`.
- `forgetLastSummary` is called from history delete/edit flows (`../history/SessionDetailScreen.tsx`) so a removed session is not revealed. Keep that coupling when changing keys.
- Summary shape (`SessionSummary`, `DropSummary`, `PersonalRecordSummary`) is defined in `@domain/types.ts` and produced by `complete-session`.

### Testing Requirements

- E2E (stack needed): `e2e/loot.spec.ts` (loot on the reveal), `e2e/a11y.spec.ts` (reduced motion), `e2e/drafts.spec.ts` and `e2e/programs.spec.ts` (finishing leads to the reveal).
- `last-summary.ts` is pure enough to unit test but currently has no file in `tests/web/`; add `tests/web/last-summary.test.ts` first when changing it (use `tests/web/memory-storage.ts` as a storage stub if needed).

### Common Patterns

- Storage access wrapped in try/catch with a null fallback.

## Dependencies

### Internal

- `../../lib/{catalog,format,history,item-rules,items,preferences,profile}.ts`, `../../components/PixelArt.tsx`, `../../pwa/install.ts`, `../workout/xp-preview.ts`, `@domain/{index,types}.ts`.

### External

- React Router.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
