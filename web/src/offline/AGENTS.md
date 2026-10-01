# offline

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-01

## Purpose

`web/src/offline/` makes workout logging work without a network. A workout is held as a local draft (one per user) in IndexedDB, with a `localStorage` fallback. When the user finishes, the draft is sent to the `complete-session` Edge Function under a per-user Web Lock, retried with backoff until the server answers, then replaced by a tombstone ("synced" record). The server stays authoritative: the draft carries only what the user entered, and XP, records and loot are computed on sync. Most logic is pure or takes injected ports so `tests/web/` can drive it with fake IndexedDB, in-memory storage and fake channels.

## Key Files

| File                   | Description                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `draft-format.ts`      | Pure. The draft data model (`WorkoutDraft`, `DraftExercise`, `DraftSet`) and the stored record shape (`StoredDraft`: `kind: 'draft'` or `'synced'`, format `v: 3`). `parseStoredDraft` validates and upgrades v2 records; `draftRecord`, `syncedRecord`, `nextUpdatedAt`. Also every draft mutation (`addExercise`, `addSet`, `updateSet`, `toggleSetDone`, `swapExercise`, `startDraftFromDay`, ...) and `isEffortInput`.                        |
| `draft-store.ts`       | The `DraftStore` interface (`get`, `put`, `markSynced`, `discard`, `userIdsWithDrafts`) with two implementations: `createIdbDraftStore` (database `gainscape`, object store `drafts`, key `userId`) and `createLocalDraftStore` (key prefix `gainscape.workout-draft.v2.`). `decidePut` is the shared write policy: results `written`, `stale`, `synced`, `refused_reopen`. `openDraftDatabase` resolves `null` on error, block or a 2 s timeout. |
| `draft-boot.ts`        | `openDraftStore` and the memoised `openDraftStoreAndReconcile`: deletes legacy v1 `localStorage` keys, opens IndexedDB, moves newer `localStorage` fallback records into it, and falls back to the local store when IndexedDB is unavailable.                                                                                                                                                                                                     |
| `draft-session.ts`     | `createDraftSession`: the per-tab state machine behind the hook. Serialises store work through a promise chain, switches to the fallback store when a write fails (`saveProblem` flag), broadcasts changes on `BroadcastChannel` `gainscape.drafts`, adopts other tabs' changes, and exposes `flush`. `flushOpenDraftSessions` flushes every live session (used before a service worker update).                                                  |
| `use-workout-draft.ts` | React hook `useWorkoutDraft(userId)`: wires `createDraftSession` to the real IndexedDB, `localStorage`, `BroadcastChannel` and `navigator.storage.persist()`. Thin; no logic worth testing here.                                                                                                                                                                                                                                                  |
| `session-payload.ts`   | `completeSessionPayload(draft)`: maps a finished draft to the `complete-session` request body (only `done` sets, renumbered positions, `isWarmup: false`).                                                                                                                                                                                                                                                                                        |
| `sync-workout.ts`      | I/O. `syncFinishedWorkout` posts the payload with `invokeAsOwner` and converts the result with `sendOutcomeFrom`; `signOutKeepingDrafts` signs out locally without touching drafts.                                                                                                                                                                                                                                                               |
| `finish-lock.ts`       | The finish lock. `attemptFinish` flushes pending writes, takes the Web Lock `gainscape.finish.<userId>` (`finishLockName`), re-reads the stored draft, sends it and marks it synced. `sendOutcomeFrom` classifies `InvokeOutcome` into `SendOutcome` (`synced`, `deleted` on 410, `retryable` on 429 and 5xx, `rejected` on other 4xx, auth outcomes).                                                                                            |
| `finish-retries.ts`    | `startFinishRetries`: drives `attemptFinish` with backoff, honours `retryAfterMs` from rate limits, retries on `online`, reports `FinishStatus` and hands terminal results to `settle`. Returns `{ onOnline, stop }`.                                                                                                                                                                                                                             |

## For AI Agents

### Working In This Directory

- **Draft format backward-compatibility rule (from the root `README.md`).** Draft formats must stay readable by the previous build: a new draft format ships only after a release that can already read it, because a tab can keep running the old bundle until it reloads. In practice this is a two-release process. Release A teaches `parseStoredDraft` to read the new version (add it to the accepted set, keep writing the old version). Release B starts writing the new version. Today the code writes `DRAFT_FORMAT_VERSION = 3` and still reads `UPGRADABLE_FORMAT_VERSION = 2`. Never bump the written version and the reader in the same release, and never drop a reader for a version that a deployed build may still write.
- Any change to `WorkoutDraft` or the stored record shape must keep old records parseable (normalise in `normalisedDraft`/`normalisedSet`) and needs a case in `tests/web/draft-format.test.ts`.
- **The `DraftStore` contract is shared.** Every behaviour of `put`, `markSynced`, `discard`, `get` and `userIdsWithDrafts` must be identical in the IndexedDB and `localStorage` stores. Put the decision in `decidePut`/`tombstoneFor`/`matchesSession` so both reuse it; do not fix one implementation only.
- **Write ordering uses `updatedAt`.** A `put` older than the stored record returns `stale`. Obtain timestamps from `nextUpdatedAt(lastSeen, now)` (strictly increasing per session) and never from raw `Date.now()`. `markSynced` writes a tombstone with `max(updatedAt, stored.updatedAt + 1)`.
- **A finished draft cannot be silently reopened.** `put` of an unfinished draft over a finished one with the same session id returns `refused_reopen` unless `{ reopen: true }` is passed. A synced session id is never overwritten (`synced`).
- **Finish lock.** All server sends go through `attemptFinish`, which holds `navigator.locks` `gainscape.finish.<userId>` so two tabs never send the same session twice, and re-reads the store inside the lock (`superseded` if another tab already synced or replaced it). The lock name is also what the service worker update flow waits on (README: the reload banner waits for any running Finish), so renaming it breaks `src/pwa` and `src/sw` behaviour. Without `navigator.locks` it sends unlocked.
- **Sync outcomes are a closed set.** Add new HTTP behaviour in `sendOutcomeFrom` and handle the new `SendOutcome` kind in `startFinishRetries`/`SettledFinish` and in the feature code that renders it. A `retryable` outcome must never be settled.
- **The session id is the idempotency key.** `complete-session` must stay idempotent per `sessionId`; the payload ids (`set.id`) come from the draft. Changing `session-payload.ts` requires the matching Edge Function schema change and an integration test.
- Persistence failures degrade, they do not throw: IndexedDB failure falls back to `localStorage`, and a failure of both sets `saveProblem`. Keep draft code from throwing into React.
- No comments, `.ts` import extensions, no dependence on `window`/`document` in the pure modules; `draft-boot.ts` and `use-workout-draft.ts` are the only files that touch browser globals directly (`indexedDB`, `localStorage`, `BroadcastChannel`, `navigator.storage`).

### Testing Requirements

All of this is stack-free: `make test-web`, or a single file with `npx vitest run tests/web/<file>`.

| Source                                    | Tests                                                                                                                                                                                                                                  |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `draft-format.ts`, `session-payload.ts`   | `tests/web/draft-format.test.ts`                                                                                                                                                                                                       |
| `draft-store.ts`, `draft-boot.ts`         | The shared contract `tests/web/draft-store.contract.ts` (`describeDraftStoreContract`), instantiated by `tests/web/draft-store.idb.test.ts` (fake-indexeddb) and `tests/web/draft-store.local.test.ts` (`tests/web/memory-storage.ts`) |
| `draft-session.ts`                        | `tests/web/draft-session.test.ts`                                                                                                                                                                                                      |
| `finish-lock.ts`                          | `tests/web/finish-sync.test.ts`                                                                                                                                                                                                        |
| `finish-retries.ts`                       | `tests/web/finish-retries.test.ts`                                                                                                                                                                                                     |
| `sync-workout.ts`, `use-workout-draft.ts` | no unit tests (I/O wiring); covered by `e2e/drafts.spec.ts`, `e2e/multi-tab.spec.ts` and `e2e/pwa/*.spec.ts` (stack needed, `make e2e`, `make e2e-pwa`)                                                                                |

Put the failing test first: a store behaviour change goes in `draft-store.contract.ts` so both stores are held to it; format or mutation changes in `draft-format.test.ts`; cross-tab or fallback behaviour in `draft-session.test.ts`; lock, outcome mapping and retry behaviour in `finish-sync.test.ts` and `finish-retries.test.ts`. A payload change also needs an integration test against `complete-session` in `tests/integration/`.

### Common Patterns

- Dependency injection through option objects (`DraftSessionOptions`, `FinishAttempt`, `FinishRetryOptions`) so tests supply fake stores, channels, `send`, `retryDelayMs` and `AbortSignal`.
- Pure immutable draft updates: each mutation returns a new `WorkoutDraft`; `updateExerciseAt` is the shared index-guarded updater.
- Records are validated on read (`parseStoredDraft` returns `null` for anything unknown, wrong user or wrong version) so corrupt or foreign data is ignored instead of crashing.
- A single promise chain per session (`enqueue`) serialises all store operations; `flush` waits until the chain stops growing.
- Result unions with a `kind` field: `PutResult`, `SendOutcome`, `FinishAttemptResult`, `FinishStatus`.

## Dependencies

### Internal

- `../lib/function-client.ts` (`invokeAsOwner`, `InvokeOutcome`), `../lib/rate-limit.ts`, `../lib/supabase.ts`, `../lib/auth-restore.ts`, `../lib/catalog.ts` (`LoadType`)
- `../features/summary/last-summary.ts` (`rememberLastSummary` in `finish-lock.ts`)
- `@domain/types.ts` (`SessionSummary`, `EffortInput`, `EffortLevel`)
- Consumed by `../features/` (train, summary), `../pwa/` and `../lib/programs.ts`

### External

- `react` 19 (`use-workout-draft.ts` only)
- Browser APIs: IndexedDB, `localStorage`, `BroadcastChannel`, Web Locks (`navigator.locks`), `navigator.storage.persist`
- Tests: `fake-indexeddb`, Vitest

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
