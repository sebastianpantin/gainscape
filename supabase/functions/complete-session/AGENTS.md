# complete-session

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-01

## Purpose

POST endpoint that accepts a finished workout draft from the web app, validates it, and stores it. Inside the edit window it inserts placeholder sets and replays XP, records and loot; outside it stores a history-only session. Resubmission of the same id returns the stored summary.

## Key Files

| File         | Description                                                                                                                                                                                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`   | Handler. `completeSession` runs in `sql.begin` under `lockUser`: idempotent on existing id, 409 `session_id_conflict`, 410 `session_deleted` for tombstones, rate limits `session_create_hour` and `session_create_day`, then `storeHistoryOnly` or `storeAndReplay` |
| `payload.ts` | Zod `sessionSchema`, `parseCompleteSessionPayload`, `assertPlausibleTiming` (throws the domain `implausibleTiming` reason as a 422)                                                                                                                                  |
| `deno.json`  | `{ "nodeModulesDir": "none" }`; picked up by `make check-functions`                                                                                                                                                                                                  |
| `deno.lock`  | Pinned dependency lock; regenerate with Deno, do not hand-edit                                                                                                                                                                                                       |

## For AI Agents

### Working In This Directory

- Server computes effective load via `effectiveLoadForNewSet`; never trust client XP.
- Needs `LOOT_SECRET` through `rollNewSessionLoot`.
- The payload shape must match the web draft sync code.

### Testing Requirements

`tests/integration/complete-session.test.ts` (plus `rate-limits.test.ts`, `loot.test.ts`, `replay.test.ts`). Add the failing case there. Stack required: `make test-integration`.

### Common Patterns

Handler is thin: OPTIONS, POST check, auth, parse, one async function, `errorResponse`. No comments in code.

## Dependencies

### Internal

- `../_shared/` (auth, db, http, rate-limit, session-payload, domain, stores)

### External

- Deno 2, `npm:zod@4.6.5`, `npm:postgres@3.4.9`

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
