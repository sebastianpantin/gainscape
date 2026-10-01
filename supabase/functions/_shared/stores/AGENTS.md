# Stores

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-01

## Purpose

The database access layer for the Edge Functions. Each module wraps the SQL for one concern (sessions, replay history, records, strength cache, loot, feed events, catalog) and translates between Postgres rows and the pure types in `../domain/`. Stores never decide game rules: they load rows, call domain functions, and write the results back. Every function takes an open `Transaction` (`postgres` `TransactionSql`, defined in `../db.ts`) as its first argument, so the calling Edge Function (`complete-session`, `edit-session`, `delete-session`, `rebuild-caches`) controls the transaction boundary and all derived data commits or rolls back together.

## Key Files

| File             | Description                                                                                                                                                                                                                                                                                                             |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sessions.ts`    | Session and set rows: `lockUser` (row lock on `profiles`, 403 `profile_missing`), `findSession`, `loadOwnedSession`, `loadStoredSets`, `tombstoneOwner`, `assertSetIdsUnused`, `loadProfileSettings`, `ownedProgramDayId`, `insertSession`, `storedSummary`, `writeSummaries`, `placeholderSetRow`, `isUniqueViolation` |
| `set-columns.ts` | Pure row mappers from `SetResult` to snake_case columns: `derivedSetColumns`, `newSetRow`, `setSkillXpRows`. No SQL                                                                                                                                                                                                     |
| `catalog.ts`     | `loadCatalog`: skills plus the exercises visible to a user (built-in, or owned and not archived unless `includeArchived`, and unlocked when `requires_unlock`), with skill shares                                                                                                                                       |
| `history.ts`     | Reads that feed replay: `loadReplayableSessions`, `loadRecordHistory`, `loadPriorSkillXpSums`, `loadSkillXp`, `hasLaterSessions`, `hasStaleDerivedSessions` (compares `derived_balance_version` with the balance version)                                                                                               |
| `strength.ts`    | `loadStrengthHistory` (windowed history rows per exercise) and `refreshStrengthCache`, which rewrites `exercise_maxes` from the latest session per exercise                                                                                                                                                             |
| `records.ts`     | `loadRecords` reads `rep_maxes`, `bodyweight_rep_records` and `cardio_records` into a `RecordState`; `replaceRecordsFor` deletes and re-inserts them for the touched exercises                                                                                                                                          |
| `replay.ts`      | `replayFrom`: the orchestrator. Loads the suffix of sessions, catalog and prior state, calls `replayHistory`, then rewrites derived set columns, `set_skill_xp`, `user_skills`, records, the strength cache and summaries, revokes disqualified drops and syncs events                                                  |
| `loot.ts`        | Loot persistence: `loadLootTables`, `loadLootDayState`, `rollNewSessionLoot` (inserts `loot_rolls`, `drops`, `item_ledger`, `user_items`, `user_unlocks`, `drop_luck`), `refreshSummaryDrops`, `loadActiveDrops`, `revokeDrops`, `revokeDisqualifiedDrops`                                                              |
| `events.ts`      | `syncSessionEvents`: computes feed events with `feedEventsForSession` (PR events find their set by the summary `setId`) and upserts or deletes rows in `public.events` so the table matches the session summaries                                                                                                       |

## For AI Agents

### Working In This Directory

- **Thin by design.** Put any decision (who qualifies for a drop, what counts as a PR, how XP splits) in `../domain/` behind a pure function and unit-test it there. A store should only load, map, call, write.
- **Always take a `Transaction`.** Never use the module-level `sql` from `../db.ts` inside a store. Callers open the transaction and call `lockUser` first so concurrent syncs for one user serialize.
- **Importing.** Import domain code from `../domain/index.ts`, HTTP errors from `../http.ts` (`HttpError`). Keep the `.ts` extension. Stores may import each other (`replay.ts` uses `catalog`, `events`, `history`, `loot`, `records`, `set-columns`, `sessions`, `strength`; `loot.ts` uses `events`), so avoid creating a cycle.
- **Delete-then-insert for derived caches.** `replaceRecordsFor`, `refreshStrengthCache`, `replaceSkillXp` and `set_skill_xp` rewrite rows for the touched exercises or sets. Empty arrays must be guarded (`if (rows.length > 0)`) because postgres.js rejects an empty `tx(rows)` insert.
- **Row mapping.** Postgres returns `numeric` and `bigint` as strings; convert with `Number(...)` (see `combat_weight`, `candidate`, XP sums). Columns are snake_case in SQL and camelCase in domain types; keep the mapping inside the store.
- **Array parameters** are passed as `${ids as string[]}::uuid[]` with `= any(...)`; follow that form.
- **Rebuild gate.** `replayFrom` throws `HttpError(503, 'rebuild_required')` when `hasStaleDerivedSessions` is true. After bumping `BALANCE_VERSION` in `../domain/balance.ts`, run `make rebuild-caches`. Session writers must keep `balance_version` and `derived_balance_version` in step through `insertSession` and `writeSummaries`.
- **Loot needs a secret.** `rollNewSessionLoot` calls `lootSecret()` (`LOOT_SECRET`, at least 32 chars) and fails with 500 `loot_secret_missing` otherwise. Seeds come from `../loot-seeds.ts`, so rolls are reproducible per user and set.
- **Schema is append-only.** If a store needs a new column or table, add a numbered migration under `supabase/migrations/`, then `make reset`. Table and column names here must match the migrations; there is no compile-time check on SQL strings.
- **Events and drops stay in sync.** Anything that changes a session summary (`writeSummaries`, `refreshSummaryDrops`, `revokeDrops`) must end with `syncSessionEvents` for the affected sessions, as `replay.ts` and `loot.ts` do.

### Testing Requirements

Stores have no unit tests of their own; they run only against a real Postgres, so every change needs the local stack (`make start`, then `make test-integration`, which runs `make functions` first). Write the failing integration test first. Run one file with `npx vitest run tests/integration/replay.test.ts`. The shared harness is `tests/integration/local-stack.ts` plus `loot-support.ts`, `collection-support.ts` and `mailbox.ts`.

| Store module                    | Integration tests that exercise it                                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sessions.ts`, `set-columns.ts` | `tests/integration/complete-session.test.ts`, `edit-session.test.ts`, `delete-session.test.ts`, `history-paging.test.ts`                               |
| `replay.ts`, `history.ts`       | `tests/integration/replay.test.ts` (including the `rebuild_required` case), `edit-session.test.ts`, `delete-session.test.ts`, `rebuild-caches.test.ts` |
| `records.ts`                    | `tests/integration/records.test.ts`, `replay.test.ts`                                                                                                  |
| `strength.ts`                   | `tests/integration/complete-session.test.ts`, `replay.test.ts`, `delete-session.test.ts`                                                               |
| `loot.ts`                       | `tests/integration/loot.test.ts`, `loot-revocation.test.ts`                                                                                            |
| `events.ts`                     | `tests/integration/events.test.ts`                                                                                                                     |
| `catalog.ts`                    | `tests/integration/catalog.test.ts`, `custom-exercises.test.ts` and every test that completes a session                                                |

Pure logic reached through a store (record rules, loot odds, event rules) is tested in `tests/domain/` and should get its failing test there first. Row-level security and grants live in `supabase/tests/*.test.sql` and `tests/integration/rls.test.ts`, not here.

### Common Patterns

- Tagged-template SQL through postgres.js: `` await tx`select ... where id = ${id}` ``, with `const [row] = await tx...` for single rows.
- Bulk writes use `tx(rows)` helper inserts with an array of snake_case objects built by the `set-columns.ts` mappers.
- Whole-record updates from a JSON payload use `jsonb_to_recordset` joins (`events.ts`, `loot.ts`, `sessions.ts`).
- Row locks with `for update` for read-modify-write (`lockUser`, `revokeDrops` on `user_items`).
- Interfaces named after the stored shape (`StoredSession`, `StoredSet`, `OwnedSession`, `ActiveDrop`, `ReplayOutcome`) separate DB reads from domain types.
- Failures are `HttpError(status, code)` with a snake_case code (`profile_missing`, `rebuild_required`); `isUniqueViolation` detects Postgres error `23505` so handlers can map it.

## Dependencies

### Internal

- `../domain/index.ts` for all game logic and types.
- `../db.ts` for the `Transaction` and `JsonValue` types.
- `../http.ts` for `HttpError`; `../loot-seeds.ts` for per-set RNGs and the loot secret.
- Consumed by `complete-session`, `edit-session`, `delete-session` and `rebuild-caches` under `supabase/functions/`, and by `../http-errors.ts` (`isUniqueViolation`).

### External

- `postgres` (npm: specifier, v3.4.9, via `../db.ts`) for the tagged-template client and `TransactionSql` type.
- A running Supabase Postgres schema from `supabase/migrations/`.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
