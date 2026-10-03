# complete-session

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-01

## Purpose

POST endpoint that accepts a finished workout draft from the web app, validates it, and stores it. Inside the edit window it inserts placeholder sets and replays XP, records and loot; outside it stores a history-only session. A draft may carry a program link and per-set prescription snapshots; they are parsed offline-first, so a bad link or snapshot is dropped instead of rejecting the workout. The response is the stored summary plus `programLinked` and `completedAt`. Resubmission of the same id returns the stored summary with the stored `programLinked` and `completedAt`, byte for byte.

## Key Files

| File         | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`   | Handler. `completeSession` runs in `sql.begin` under `lockUser`: idempotent on existing id, 409 `session_id_conflict`, 410 `session_deleted` for tombstones, rate limits `session_create_hour` and `session_create_day`, then `storeHistoryOnly` or `storeAndReplay`. `linkedProgram` keeps the link only for an owned enrollment (ended ones too) whose template accepts the position (`private.is_valid_program_position`); otherwise the session is stored unlinked and every snapshot is dropped. Answers `{ ...summary, programLinked, completedAt }`, with `completedAt` the stored `completed_at` as an ISO string |
| `payload.ts` | Zod `sessionSchema`, `parseCompleteSessionPayload` (takes each set's `prescription` out before the strict set schema and keeps only what the domain `storableSnapshot` accepts; a malformed `program`, or one with a NUL in its position, becomes `null`), `assertPlausibleTiming` (throws the domain `implausibleTiming` reason as a 422)                                                                                                                                                                                                                                                                                |
| `deno.json`  | `{ "nodeModulesDir": "none" }`; picked up by `make check-functions`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `deno.lock`  | Pinned dependency lock; regenerate with Deno, do not hand-edit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

## For AI Agents

### Working In This Directory

- Server computes effective load via the domain `writableSetFor` and records it as `recordedEffectiveLoadKg` so history-only sessions keep it; never trust client XP.
- Needs `LOOT_SECRET` through `rollNewSessionLoot`.
- The payload shape must match the web draft sync code.
- Offline-first: never answer 4xx for a malformed or duplicate prescription or a malformed `program`. Duplicate refs keep the first set's snapshot (`storableSnapshots`). The rest of the payload is validated as strictly as before.
- `410 session_deleted` is unchanged; the web cache appends nothing for it.

### Testing Requirements

`tests/integration/complete-session.test.ts` and `program-sessions.test.ts` (plus `rate-limits.test.ts`, `loot.test.ts`, `replay.test.ts`). Add the failing case there. Stack required: `make test-integration`.

### Common Patterns

Handler is thin: OPTIONS, POST check, auth, parse, one async function, `errorResponse`. No comments in code.

## Dependencies

### Internal

- `../_shared/` (auth, db, http, rate-limit, session-payload, domain, stores)

### External

- Deno 2, `npm:zod@4.6.5`, `npm:postgres@3.4.9`

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
