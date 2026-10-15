# Stores

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

The database access layer for the Edge Functions. Each module wraps the SQL for one concern (sessions, replay history, records, strength cache, loot, feed events, catalog, gear, challenges, rebuild listing) and maps between Postgres rows and the pure types in `../domain/`. Stores never decide game rules: they load rows, call domain functions and write the results back.

## Map

- `replay.ts`: the intent-level operations the handlers call (`deriveNewSession`, `deriveEditedSession`, `deleteSessionAndRederive`, `rebuildDerivedState`). All run the private `replayFrom`, which loads the session suffix, catalog and prior state, calls the domain `replayHistory`, then rewrites derived set columns, `set_skill_xp`, `user_skills`, records, the strength cache and summaries, revokes disqualified drops and syncs events. Start here for any derived-data change.
- `sessions.ts` (session and set rows, `lockUser`, edit writes) and `set-columns.ts` (pure row mappers, no SQL).
- `history.ts`, `records.ts`, `strength.ts`: replay inputs and derived caches.
- `loot.ts`, `events.ts`, `gear.ts`, `challenges.ts`, `catalog.ts`, `rebuild.ts`: one concern each.
- `quests.ts`: quest definitions and progress, quest XP grants for replay, and `advanceQuestsForSession` for `complete-session`.

## Rules and gotchas

- Thin by design. Any decision (drop qualification, what counts as a PR, XP split) goes in `../domain/` behind a tested pure function.
- Every function takes an open `Transaction` first; never use the module-level `sql` from `../db.ts` here. The caller opens the transaction and calls `lockUser` first so concurrent syncs for one user serialize and all derived data commits or rolls back together.
- Stores import each other (`replay.ts` uses most of them, `loot.ts` uses `events.ts`). Do not create a cycle.
- Derived caches are delete-then-insert for the touched exercises or sets. Guard empty arrays (`if (rows.length > 0)`): postgres.js rejects an empty `tx(rows)` insert.
- Postgres returns `numeric` and `bigint` as strings: convert with `Number(...)` or `nullableNumber`; timestamps through `isoTimestamp`. Keep snake_case to camelCase mapping inside the store.
- Pass arrays as `${ids as string[]}::uuid[]` with `= any(...)`.
- SQL strings have no compile-time check against the schema. Names must match `supabase/migrations/`; a new column means a new migration, then `make reset`.
- `sets.xp_awarded` is base XP before the gear bonus, while `set_skill_xp` includes the bonus. So with gear, a set's `xp_awarded` no longer equals its `set_skill_xp` sum. Skill sums (`user_skills`, prior sums, hiscores) read `set_skill_xp`.
- Replay reads gear only from the stored `sessions.gear_loadout` snapshot, never from `user_loadout`, and always writes `gearBonusBySkill` into the summary (`{}` when none) so an edit cannot keep a stale bonus. The challenge result and server floors are also stored in the summary.
- Hold sets are stored as `weight_kg` and `effective_load_kg` with `duration_s` or `distance_m` and null `reps`. `setKindOfRow` tells rows apart: reps means lift, weight without reps means hold, neither means cardio. Replay uses a hold's recorded effective load.
- Rebuild gate: when any session's `derived_balance_version` differs from the balance version, `replayFrom` rebuilds that user inside the same transaction (the user lock is already held) in one pass: it clears the caches, replays every session, stamps `derived_balance_version`, and still revokes drops and reports `replayedSessionIds` only from the requested session on, so the caller sees the same answer as a plain replay. One pass, not a rebuild followed by a replay, keeps the request inside the edge CPU limit. Only a failing self-heal answers `HttpError(503, 'rebuild_required')`, so a stale user is never locked out of writes. After bumping `BALANCE_VERSION`, still run `make rebuild-caches` so users who never write again are refreshed too; `listUsersToRebuild` uses the same `not history_only and derived_balance_version <> version` test (index-only scan on `sessions_by_user_derived_version`). Session writers keep `balance_version` and `derived_balance_version` in step through `insertSession` and `writeSummaries`.
- Loot needs `LOOT_SECRET` (at least 32 characters) or fails with 500 `loot_secret_missing`. Seeds come from `../loot-seeds.ts`, so rolls are reproducible per user and set.
- Anything that changes a session summary (`writeSummaries`, `refreshSummaryDrops`, `revokeDrops`) must end with `syncSessionEvents` for the affected sessions, so `public.events` matches the summaries.
- `claimChallengeRun` locks the caller's scroll row (`for update`), takes one scroll (`user_items` minus 1, `item_ledger` delta -1, reason `challenge`) and snapshots the e1RM at the session. Retired challenges or scrolls cannot be claimed.
- Postgres `23505` on a client-id constraint is mapped to an HTTP error in `../http-errors.ts`. Failures are `HttpError(status, snake_case_code)`.
- Quest XP is a grant anchored at a session key (`quest_completions.anchor_*`, no foreign key, so it outlives a deleted anchor). Replay adds grants anchored before `from` to the prior sums and passes later ones to `replayHistory`; the new-session fast path also needs no grant at or after `from`, or `user_skills` would count it twice. Only `complete-session` writes quest rows; replay, edit, delete and rebuild only read grants. The quest event has no session, so `syncSessionEvents` never prunes it, and `summary.quests` survives replays because `writeSummaries` merges.
- `loadQuests` skips a quest whose stored definition does not parse (`console.error`) instead of failing every sync; its progress rows stay untouched and `start-quest` answers 404 `quest_not_found`. Accepted gaps: a quest event's `levelUps` are frozen at completion and can disagree with the session level events after an older session syncs out of order, and a level 99 reached through quest XP shows only in the quest event (no `level_99` event).
- `StoredSet` lives in the domain `edit-diff.ts`, not here, because the no-op edit check needs it.

## Testing

- No unit tests: stores run only against real Postgres. Write the failing test in `tests/integration/` first and run it with the stack (`make test-integration`, or `npx vitest run tests/integration/replay.test.ts` after `make functions`). Test files are named after the function or concern (`replay`, `records`, `loot`, `loot-revocation`, `events`, `gear-session`, `rebuild-caches`, ...).
- Pure logic reached through a store gets its failing test in `tests/domain/` first. RLS and grants live in `supabase/tests/` and `tests/integration/rls.test.ts`.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
