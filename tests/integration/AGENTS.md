# tests/integration

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

Tests that drive the real local Supabase stack: Edge Functions over HTTP, SQL RPCs and RLS through the Supabase client, direct SQL through `postgres`, and GoTrue email flows through Mailpit. They prove the server-authoritative pipeline end to end. Nothing is mocked; the stack must be running.

## Map

- `<function-or-rpc>.test.ts`: one file per Edge Function or RPC area (`complete-session`, `edit-session`, `delete-session`, `replay`, `loot`, `loot-revocation`, `crafting`, `challenges`, `gear-session`, `programs`, `program-enrollments`, `program-sessions`, `social`, `events`, `account`, `reset-account`, `rate-limits`, `rls`, ...). A new RPC with no home gets its own file.
- `*-parity.test.ts`: the SQL side and the domain or web side must agree (`program-validation-parity` positions, `program-follow-parity` published custom programs vs web `followStatus`/`customTemplateKey`/`customLiftKey`, `collection-parity` SQL `get_profile` vs web collection counts). `strength-state.test.ts` is parity of `exercise_strength_state` with `strengthStateAt`.
- Coverage guards: `export-coverage.test.ts` fails unless every user-owned `public` table (a `user_id` or `owner_user_id` column, or an FK to `profiles`) and every child table reached from one maps to an `EXPORT_SECTIONS` key or has a reason in the not-exported lists. `reset-account.test.ts` fails unless every user-owned table is in `WIPED_TABLES` or `KEPT_TABLES`. A new table must be added to both.
- Helpers (not tests):
  - `local-stack.ts`: the central helper, with a side effect on import. Reads `npx supabase status -o json` into `env` and exports `db` (postgres.js), `admin`, `anon`, `createTestUser`, `fetchFunction`, `postCompleteSession`, `rebuildCaches`, `normalizedSnapshot`, `ageSession`, `seedRateLimitHits`, `hmacRngFor`, loot and event snapshots, and `createHoldExercise` (custom hold exercises have no RPC).
  - `session-support.ts`: payload builders (`aSet`, `aBout`, `payloadAt`), `postSession`, `editSession`, `trackedUsers`, `startsOnOneLocalDay`, time constants.
  - `program-support.ts`: program builders for `save_program` and `publish_program`.
  - `account-support.ts`: `USER_TABLES`, `giveUserEverything`, `userRowCounts` shared by account and reset tests.
  - `collection-support.ts`: web-side collection counts as a user.
  - `mailbox.ts`: Mailpit client (`waitForEmail`, `authLinkFrom`), subjects and the resend wait read from `supabase/config.toml`. Re-exported by `e2e/support/mailbox.ts`; `local-stack.ts` is reused by `e2e/support/db.ts`.

## Rules and gotchas

- Use `local-stack.ts` for every stack interaction. Never create a second Supabase client or hardcode URLs or keys; `env` comes from `supabase status`.
- `local-stack.ts` refuses to run when `.stack.env` names a different `SUPABASE_PROJECT_ID`. Never point these tests at a hosted project; run through `make` or `set -a; . ./.stack.env; set +a`.
- Isolation comes from fresh users (`createTestUser()`: random `t_<hex>` username, `@example.test` email, confirmed), never from truncating tables. Files run in parallel on 4 workers against one database: never assume an empty DB or a quiet table.
- A file that edits or counts global rows must be listed in `INTEGRATION_FILES_SHARING_GLOBAL_STATE` in `vitest.config.ts` so it runs alone in the `integration-serial` project (today `auth-email`, `catalog`, `challenges-global`, `crafting-global`, `loot-global`, `quest-retirement`, `rate-limits`; `quest-retirement` because it retires a seeded quest).
- `replay-scale.test.ts` seeds 2,000 sessions by direct SQL and times a rebuild, an edit of the earliest session and a self-healing edit. It runs serially (`INTEGRATION_BENCHMARKS`). The edge runtime's 2 s CPU hard limit per worker (local and hosted alike) is the real bound: a regression back to quadratic replay shows up here as a `546 WORKER_LIMIT`.
- End the pool in `afterAll(async () => { await db.end(); })` in every new file that imports `db`.
- `fetchFunction` retries up to twice (`retryEdgeRuntimeDrops` from `scripts/function-batch.ts`) on a 5xx whose body has no app `error` key: the edge runtime drops a request when a `per_worker` worker retires at its CPU soft limit. An empty or bodiless 5xx is that, not an app bug. The web client retries the same way.
- `postSession` asserts HTTP 200; call `postCompleteSession` directly to assert a rejection. Responses are `FunctionResponse` (`status`, `body`, `rawBody`, `headers`); errors are checked on `body.error`.
- Never sleep: move sessions back with `ageSession`, pre-fill rate limit buckets with `seedRateLimitHits`, compare against the database clock with `databaseNow`.
- Use `startsOnOneLocalDay(count)` so a batch of sessions lands on one Stockholm local date whenever the test runs.
- `hmacRngFor(userId)` reads `LOOT_SECRET` from `supabase/functions/.env.local` (written by `make functions`) to reproduce server loot rolls.
- Consistency proof pattern: `normalizedSnapshot(userId)` before and after `rebuildCaches(userId)`; edits and replays must match a rebuild. The snapshot includes the quest tables, which a rebuild must leave alone, but leaves out the sync-time summary keys `drops` and `quests`, which depend on sync order.
- A quest only counts sessions that ended after it started: seed or backdate `quest_progress.started_at` with `db` rather than starting the quest and waiting.
- `rebuild-caches` is secret-key only: a caller without the secret key in `apikey` gets 403.
- Racing unique violations: `complete-session.test.ts` holds an uncommitted row in a second transaction with `session_replication_role = replica` (skips its foreign-key locks). A taken session id is 409 `id_conflict`; a duplicate loot roll key is a 500.
- Concurrency tests open a second connection pool (`pin-cap.test.ts`: the 51st pin waits on the profile row lock of `private.cap_pins` and fails with `too_many_pins`; `challenges.test.ts`: one winner of two concurrent scroll claims).
- PostgREST caps responses at 1000 rows (`max_rows`); `exercise-progress.test.ts` holds that `queryProgressSets` (one `jsonb` RPC result) returns more than that.
- Program links: `complete-session` keeps the link for an ended enrollment, but answers 200 unlinked for another user's or an unknown enrollment, an out-of-bounds position or a malformed `program`. A malformed snapshot is dropped alone. Resubmits answer the stored `programLinked` and `completedAt` byte for byte (millisecond precision).
- Email flows: note `since = new Date()`, trigger the auth action, `waitForEmail(to, { subject, since })`, then `authLinkFrom(message)`. Fresh addresses keep mailboxes apart, so nothing is deleted. The resend wait is `[auth.email] max_frequency` plus 500 ms.
- Schema or function changes need `make reset` before these tests pass; they run the migrations, not a snapshot.

## Testing

- Prerequisite: `make start` (stack plus served Edge Functions). All: `make test-integration` (runs `make functions` first). One file: `npx vitest run tests/integration/rls.test.ts` with functions already served.
- Red-green: write the failing `it` in the file for the function or RPC, run that file, change the migration or function, `make reset` if SQL changed, rerun, then `make test-integration` and `make test-db`.
- Typical shape: `beforeAll` creates users and looks up `builtInExerciseId('<key>')`; each `it` posts a payload, asserts status and JSON, then database rows through the tagged-template `db`. RLS tests call as `user.client` or `anon`; privileged setup uses `admin` or `db`.
- Pure rule changes belong in `tests/domain/` first; add an integration case only to prove the server wires it. Policy, grant and trigger checks that need no HTTP are better as pgTAP in `supabase/tests/`.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
