# offline

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

`web/src/offline/` lets you log a workout without a network. Each user has one local draft, kept in IndexedDB with a `localStorage` fallback. On Finish the draft goes to the `complete-session` Edge Function under a per-user Web Lock and is retried until the server answers. Then a tombstone replaces it. The server stays authoritative: the draft holds only what the user entered, and the server computes XP, records and loot on sync. It also holds the per-user screen caches that let the other tabs open offline.

## Map

- Draft model and every draft mutation: `draft-format.ts` (pure). The set-editing rules it shares with history edit (`updateSet`, `addSet` seeding, the set limit, `withLoadType`, ...) live in `../lib/exercise-edit-rules.ts`. Import them from there.
- Storage: `draft-store.ts` defines the `DraftStore` contract with an IndexedDB store and a `localStorage` store. `draft-boot.ts` opens and migrates them.
- Per-tab state machine: `draft-session.ts`, wrapped by the thin hook `use-workout-draft.ts` (`useWorkoutDraft`).
- Finish pipeline: `session-payload.ts` builds the request, `finish-lock.ts` (`attemptFinish`, `sendOutcomeFrom`) sends it, `finish-retries.ts` (`startFinishRetries`) retries it, and `sync-workout.ts` does the real I/O.
- Device cleanup: `local-drafts.ts` holds the draft checks and forgets across both stores. `user-device-data.ts` has `forgetUserDeviceData` (account deletion) and `forgetUserProgressData` (Reset all data).
- Screen caches: `*-cache.ts`, each a per-user `Storage` cache, mostly built with `userCache` from `cache-first.ts`. Screens load them through `loadCacheFirstWhenOffline`. Program state is in `program-cache.ts`, `program-facts-cache.ts` (pure facts merge) and `program-refresh.ts`.

## Rules and gotchas

### Draft format

- New formats ship in two releases, because a tab can keep running the old bundle until it reloads. Release A teaches `parseStoredDraft` to read the new version. Release B starts writing it. Never do both in one release. Never drop a reader for a version a deployed build may still write. Today the code writes v5 (v6 for a draft with a hold, so a previous build never misreads a hold as a lift) and reads v2 to v6.
- Most new fields need no format bump: optional fields are parsed with defaults, and a malformed value reads as `null`. Examples are `program`, `prescription`, `supersetId`, `challenge`, `sessionRpe` and `clientId`. Every mutation must keep these fields.
- Any change to `WorkoutDraft` or the stored record must keep old records parseable (`normalisedDraft`/`normalisedSet`) and needs a case in `tests/web/draft-format.test.ts`.
- `e2e/support/app.ts` hard-codes the IndexedDB names (`gainscape`, store `drafts`), the fallback key prefix `gainscape.workout-draft.v2.` and a stored record shape. Change them together.
- Tombstones are disguised for older builds. `storableRecord` writes a discarded or forgotten tombstone as `kind: 'synced'` with a `tombstone` marker. An older build reads any record it cannot parse as an empty slot and could write the session back. A synced record blocks that. A format bump would not help, because the old parser treats unknown versions as empty too. Every store write goes through `storableRecord`.
- An older v4 tab reads a v5 record as "no draft" without deleting it. A workout it starts overwrites that record under the same `userId` key. The update prompt makes this rare. It is a known gap.
- `clientId` is the stable React key of an exercise card and is never sent to the server. The parser gives an exercise stored without one the positional `exercise-<index>`, so boot compares records deterministically.
- `withValidSupersets` runs on every parse and after every group change, remove or swap. A superset id survives only on one adjacent run of two or more lifts. Cardio never keeps a `supersetId`.
- `startDraftFromDay` ignores `PlannedExercise.progression`, so it is never stored and needs no bump.
- The set cap must match the server's `MAX_SETS_PER_SESSION`, counting planned sets too. Bouts are capped at 4 hours in total; the cap is checked only when adding, and making an existing bout longer is not guarded. The add functions silently add nothing past either cap.
- `startDraftFromChallenge` never rounds a barbell load below the bar. An exercise with no `equipment` counts as a barbell, because older items caches lack equipment.
- `markPlannedSetsDone` skips 5RM tests and optional program sets, because their numbers are placeholders.
- Drafts carry no gear. `complete-session` snapshots the loadout equipped at sync time, so a workout synced after a gear change gets the new gear's bonus.

### Stores and boot

- The `DraftStore` contract is shared. `put`, `markSynced`, `discard`, `forget`, `get` and `userIdsWithDrafts` must behave the same in both stores. Put decisions in `decidePut`/`tombstoneFor`, never in one implementation only.
- Write order comes from `updatedAt`. A `put` older than the stored record returns `stale`. Take timestamps from `nextUpdatedAt(lastSeen, now)`, which increases strictly, never from raw `Date.now()`. Tombstones are stamped `max(updatedAt, stored.updatedAt + 1)`.
- A finished draft cannot be silently reopened. `put` of an unfinished draft over a finished one with the same session returns `refused_reopen` unless it gets `{ reopen: true }`. A synced or discarded session id is never overwritten.
- `forget` leaves a forgotten tombstone so a tab still signed in to a deleted account cannot write the session back (`put` answers `discarded`). Boot deletes forgotten tombstones once they are a day old. A record it cannot parse is deleted.
- `openDraftDatabase` resolves `null` on error, on a blocked open or after a 2 s timeout. It never hangs.
- Boot moves `localStorage` fallback records into IndexedDB, but never over another session's stored draft, so neither workout is lost. It removes the fallback key only while the key still holds the record it moved. It deletes legacy v1 keys.
- `openPrimaryDraftStore` memoises only a successful boot, so the next call retries IndexedDB. `openDraftStoreOrFallback` (auth, settings and What's new checks) skips IndexedDB for the rest of the page load after a failed boot, to avoid repeated 2 s waits.
- Once a session has written to the fallback in this page load, `openDraftSessionStore` rejects with `SESSION_STAYS_ON_FALLBACK`. Otherwise a late IndexedDB open would hide the workout being logged.
- No unsynced draft stays hidden. When the main store has none and the fallback has one, the session opens the fallback draft instead of a fresh workout. The exception is a stale copy of a synced or discarded session. A copy older than a discard is not resurrected, but fallback edits newer than the discard still open. `waitingDraft` and the `opened_waiting` start outcome tell the screen.
- Persistence failures degrade instead of throwing into React. If IndexedDB fails, the session uses `localStorage`. An unreadable boot sets `saveProblem` to `unreadable`, which is never shown as "no draft". If both stores fail, it sets `unsaved`.
- `openDraftStore` rejects when IndexedDB exists but cannot open; only the session fallback and `openDraftStoreOrFallback` degrade to `localStorage`. Boot moves a fallback draft in regardless of age when the stored record is another session's tombstone, because it is the only copy of that workout.
- Only `draft-boot.ts` and `use-workout-draft.ts` touch browser globals (`indexedDB`, `localStorage`, `BroadcastChannel`, `navigator.storage`). Everything else takes injected ports.
- Cross-tab sync uses the `BroadcastChannel` `gainscape.drafts`. Within a session, one promise chain (`enqueue`) serialises store work. `flush` waits until the chain stops growing. `flushOpenDraftSessions` runs before a service worker update.

### Finish and sync

- Every server send goes through `attemptFinish`. It holds `navigator.locks` `gainscape.finish.<userId>` so two tabs never send one session twice, and it re-reads the store inside the lock (`superseded` when another tab already synced or replaced the draft). Without `navigator.locks` it sends unlocked.
- Do not rename the lock (`finishLockName`). The service worker update flow in `src/pwa` and `src/sw` waits on it before reloading.
- Sync outcomes are a closed set in `sendOutcomeFrom`:
  - `deleted` on 410.
  - `retryable` on 429, 5xx, and 404/408/425 (function missing mid-deploy, gateway timeout).
  - `serverFault` on every 5xx except the `rebuild_required` 503.
  - `rejected` on other 4xx and on the server's own `profile_not_found` 404.
  - A new kind must also be handled in `startFinishRetries`/`SettledFinish` and in the feature UI. A `retryable` outcome is never settled.
- Retries honour `retryAfterMs`, restart on `online`, and stop as `stalled` after 5 consecutive server faults (`MAX_CONSECUTIVE_SERVER_FAULTS`). They stop at once with `wrong_account` when another account is signed in. Another account's draft is kept but never sent.
- The session id is the idempotency key, and set ids come from the draft. A `session-payload.ts` change needs the matching `complete-session` schema change and an integration test. `ci-changes` treats `session-payload.ts` as backend input for this reason.
- The payload sends only done sets, renumbered. Supersets are display only and never sent. An interval bout never sends `durationS`, because the server derives it.
- When the server already holds the session with other content, the summary carries `storedContentDiffers`. The draft is still marked synced, and the reveal says the local copy was not applied.
- After a synced challenge, `syncFinishedWorkout` lowers the scroll count in the items cache (`spendCachedScroll`, never below 0 and never removing the entry, matching `user_items`, which keeps the row at quantity 0), so an offline Items tab does not offer a used scroll.

### Screen caches

- Every screen cache is per user. Build it with `userCache` (zod-checked; another user's data or malformed data reads as null; storage errors never throw). Save it after each online load and show the module's `Offline: using your saved …` notice. Add its `forget` to `forgetUserDeviceData` or `forgetUserProgressData`: `tests/web/user-device-data.test.ts` fails on any `gainscape.` key that is not cleared.
- Cache keys carry a version (`gainscape.items.v1.` and similar). Bump it when the stored shape changes incompatibly.
- `forgetUserProgressData` (Reset all data) clears only what mirrors server progress and keeps the device choices. `forgetUserDeviceData` (account deletion) clears that plus the preference stores. With a `draftChannel`, forgetting posts `discarded` so every open session, including the active workout bar, drops the workout.
- `loadCacheFirstWhenOffline` returns the saved copy at once while offline, or throws `OfflineError` when nothing is saved. Otherwise the request would wait about 7 s on postgrest-js's GET retries.
  - Going offline mid-load or a network error gives the saved copy with `offline: true`.
  - A server or RLS error gives the saved copy with a `problem`.
  - Screens without a cache call `failFastWhenOffline` first. Do not change postgrest-js retries globally.
- `profileCache` is not saved when its load was cancelled, so an older answer cannot overwrite a newer edit.
- `program-list-cache` defaults a missing `progression` to `{ kind: 'none' }` so old lists still load. `lib/programs.ts` updates the list right after a save or delete, so a failed refresh cannot keep the old program.
- `program-cache.ts`: `refreshed: true` means a full refresh has written the cache at least once. Only then does offline `useActiveProgram` treat a missing enrollment as "not following". `withEnrollment` keeps facts only for the same enrollment.
- `program-facts-cache.ts`: a local fact is appended once per linked synced outcome. A fetch keeps a local append only when the snapshot lacks its id and `appendedAt >= ticket.startedAt`. A delete bumps `generation` so a stale fetch ticket is dropped. Facts use the domain `resolveEffort`/`storableSnapshots`, exactly as the server stores them. Only rep lifts become facts.
- `program-refresh.ts` saves the enrollment before fetching its facts, keeps the cache when a fetch fails, and clears it when the enrollment ended elsewhere.
- `collection-cache.ts` merges with the newer exercise list from `lib/catalog-cache.ts`. That list wins for the exercises it has.

## Testing

- Stack-free: `make test-web`, or `npx vitest run tests/web/<file>`. Tests are mostly `tests/web/<module>.test.ts`. The non-obvious ones:
  - Store behaviour goes in the shared contract `tests/web/draft-store.contract.ts`, run by `draft-store.idb.test.ts` (fake-indexeddb) and `draft-store.local.test.ts` (`memory-storage.ts`). Never test only one store.
  - `finish-lock.ts` is tested in `finish-sync.test.ts`.
  - Program draft fields and `startDraftFromPrescription` are in `program-draft.test.ts`. `boutPayload` is in `session-payload.test.ts`. The online cache saves are in `screen-cache-saves.test.ts` (mocked `supabase`).
- `sync-workout.ts` and `use-workout-draft.ts` have no unit tests. E2E covers them: `e2e/drafts.spec.ts`, `e2e/multi-tab.spec.ts`, `e2e/challenges.spec.ts` and `e2e/pwa/*.spec.ts` (`make e2e`, `make e2e-pwa`).
- A payload change also needs an integration test against `complete-session` in `tests/integration/`.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
