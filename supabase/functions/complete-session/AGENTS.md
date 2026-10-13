# complete-session

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

POST endpoint that accepts a finished workout draft from the web app, validates it and stores it. Inside the edit window it stores the sets and replays XP, records and loot; outside it stores a history-only session. It answers the stored summary plus `programLinked` and `completedAt`.

## Map

- `index.ts`: the handler. `completeSession` runs in one `sql.begin` under `lockUser`; the domain `planNewSession` picks scored or history-only, then `storeAndReplay` or `storeHistoryOnly`.
- `payload.ts`: the zod `sessionSchema`, `parseCompleteSessionPayload`, `assertPlausibleTiming` (domain `implausibleTiming` as a 422).
- `deno.json` (picked up by `make check-functions`) and `deno.lock` (regenerate with Deno, never hand-edit).

## Rules and gotchas

- Idempotent on the session id: a resubmission answers the stored summary, `programLinked` and `completedAt` byte for byte. If the resubmitted sets, notes or session RPE differ (domain `isNoOpEdit` against `loadStoredSets`; timing is not compared), it still stores nothing and adds `storedContentDiffers: true`, so a client that re-finished a saved workout can tell its changes were not applied.
- 409 `session_id_conflict` for an id another user holds or deleted, 410 `session_deleted` for a tombstone. Rate limits `session_create_hour` and `session_create_day`.
- Never trust client XP. The server computes effective load with the domain `writableSetFor` and stores it as `recordedEffectiveLoadKg`, so history-only sessions keep it for later replay.
- Gear is snapshotted from `loadEquippedLoadout` into `sessions.gear_loadout` at sync time (always an object, `{}` without gear). The client sends no gear.
- Offline-first parsing: never answer 4xx for a malformed or duplicate prescription or a malformed `program`. A bad snapshot is dropped, duplicate refs keep the first set's snapshot, and a bad link stores the session unlinked with every snapshot dropped. Everything else is validated strictly.
- `linkedProgram` keeps the link only for an owned enrollment (ended ones too) whose template accepts the position (`private.is_valid_program_position`).
- Challenges: the client sends only `{ challengeId }`. A scored session claims one scroll with `claimChallengeRun` in the same transaction and snapshots the definition and pre-session e1RM into `sessions.challenge`. The scroll is used whether the verdict passes or fails, and an edit or delete refunds nothing. With no scroll left, a retired challenge, or a history-only session, the session is stored as a normal one and no scroll is used.
- `sessionRpe` and `challenge` are optional and default to `null` for older clients. Notes strip NUL characters.
- Needs `LOOT_SECRET` (loot is rolled in `rollNewSessionLoot`).
- The payload shape must match `web/src/offline/session-payload.ts`.
- Keep the handler thin: auth, parse, one transaction function, `errorResponse`.

## Testing

`tests/integration/complete-session.test.ts`, `program-sessions.test.ts`, `challenges.test.ts`, plus `rate-limits`, `loot` and `replay`. Add the failing case there; `make test-integration` (stack).

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
