# lib

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-14

## Purpose

`web/src/lib/` is the web app's non-visual layer. It holds the Supabase client, auth boot and sign-out, typed fetchers and RPC wrappers for every feature, the TanStack Query setup, the per-user device stores, and the pure rule modules all of these use. Decisions live in pure modules that `tests/web/` covers without a stack. I/O modules only fetch and hand the rows to a pure function.

## Map

Files are grouped by area. A `-rules.ts` file sits in the same folder as its I/O sibling, and a new file goes in the folder of the area it serves.

- `platform/`: the Supabase client, Edge Function calls, auth, `keyedStore`, rate limits, cross-tab channels, online and route-focus hooks, device and celebration effects, and the changelog rules with the last seen release.
- `query/`: the TanStack Query client, every query definition, freshness and state rules, and `data-changes.ts`.
- `exercises/`: the exercise catalog and its device cache, custom exercises, exercise notes, search, swap substitutes and repeat keys.
- `workout/`: live-workout rules and stores: set editing, cardio, effort labels, supersets, warm-ups, plates, rest timer, training device, session timing and baseline, progression hints, the active workout bar.
- `programs/`: program persistence, enrollment and every `program-*-rules.ts`.
- `history/`: past sessions, the history overview and the last session of an exercise.
- `progress/`: standing, the skill map, recovery, weekly goal, weekly muscle volume, bodyweight trend and exercise progress.
- `collection/`: items, gear, challenges, the companion pet and the records collection.
- `profile/`: profile and its view, account actions, preferences and onboarding.
- `social/`: friends, feed and hiscores.
- `quests/`: the quest log (cache-first), `start-quest` and `quest-rules.ts` (board, step and requirement text, start errors).
- `ui/`: pure helpers behind shared components (number field, count-up, line chart, toast, term help) and `glossary.ts`.
- The root keeps only small cross-cutting helpers: `format.ts`, `units.ts`, `names.ts`, `error-text.ts`, `json-rules.ts`, `rows.ts`, `reorder.ts`.
- Start here:
  - `platform/supabase.ts`: the one client.
  - `platform/use-auth-session.ts` over `platform/auth-restore.ts`: auth boot, offline fallback, sign-out.
  - `platform/function-client.ts` over `platform/function-client-rules.ts`: `invokeAsOwner` for Edge Functions.
  - `query/query-client.ts`, `query/queries.ts`, `query/query-freshness-rules.ts` and `query/data-changes.ts`: the server data cache and its invalidation.
- `*-rules.ts` files are pure. These are pure too, without the suffix: `units.ts`, `format.ts`, `workout/effort-labels.ts`, `error-text.ts`, `names.ts`, `platform/rate-limit.ts`, `platform/auth-links.ts`, `platform/auth-restore.ts`, `exercises/catalog-cache.ts`, `exercises/exercise-note-cache.ts`, `ui/glossary.ts`, `reorder.ts`, `rows.ts`.
- A `<feature>.ts` beside a `<feature>-rules.ts` is the I/O half (catalog, history, items, social, profile, standing, skill-map, last-session, exercise-progress, bodyweight-trend, weekly-goal, recovery, onboarding, exercise-notes). Other I/O modules: `progress/standing-data.ts`, `programs/programs.ts`, `programs/program-enrollment.ts`, `collection/collection-data.ts`, `exercises/custom-exercises.ts`, `profile/account.ts`.
- `*-store.ts`: per-user settings kept only in this device's `localStorage` (rest timer, plates, training device, onboarding, last seen release, program summary dismissals, companion pet). They are never synced.
- `programs/program-*-rules.ts`: following a program (enroll form, Train cards, plan, references, skip, set markers, rollover summary, follow status, facts, error text). The program engine itself is `@domain/program-*.ts`.
- Only a few files use React: the contexts in `profile/preferences.ts` and `ui/toast.ts`, and the hooks in `progress/standing.ts`, `progress/skill-map.ts`, `platform/use-auth-session.ts`, `platform/use-online.ts`, `platform/use-route-focus.ts` and `query/data-changes.ts`.
- `ui/glossary.ts` is the only home of jargon help text (`TermHelp`, the Settings effort hints, the first-run cards).
- `platform/device-effects.ts` and `platform/celebration-effects.ts`: audio, vibration and reduced motion. They are I/O only. `e2e/reveal.spec.ts` covers only the level-up cue; the loot and craft fanfares have no automated coverage.

## Rules and gotchas

### Boundaries

- Keep the pure/I/O split. Pure modules take their dependencies as arguments (`querySessionPage(client, ...)`, `queryRecentSets(client, since)`, `queryProgressSets(client, ...)`, `queryOwnedPets(client, ...)`, `bootAuth(ports)`, `readCachedExercises(storage, ...)`). That way integration tests can pass their own client and tests can fake time.
- Never import `platform/supabase.ts` from a pure module. It reads `window.location` and `import.meta.env` at import time, which breaks plain Vitest runs. Import `SupabaseClient` as a type only.
- `platform/changelog-rules.ts` must not import any app code, because plain Node loads it for `make changelog-unreleased` and `make deploy`. That is why `whatsNewMayOpen` takes `introPending` as a boolean.
- `profile/profile.ts` re-exports `profile/profile-rules.ts`; keep that re-export. No other module re-exports, so import from the module that defines the name (`countCollection` from `collection/collection-rules.ts`, not from `collection/collection-data.ts`).
- Use the domain engine through `@domain/*`. Never reimplement levels, strength, collection or the caps:
  - `HIGHEST_REPS` is the domain `MAX_SET_REPS`.
  - The set cap is `MAX_SETS_PER_SESSION`.
  - `finishedAtFor` caps a workout at `MAX_SESSION_DURATION_MS`, so a workout left open overnight still syncs.
- `progress/recovery-rules.ts` (recent days, on the client) is separate from the server's within-session `domain/fatigue.ts`. They share only `effortProximity`.
- `queryRecentSets` has no user filter; it relies on the owner-only `sets` RLS policy. Add an owner filter if `sets` ever becomes readable by friends.
- `feedPreviewQuery` deliberately uses `FRESH_FOR_MS` although the feed root is always stale.

### Server calls and errors

- Call Edge Functions with `invokeAsOwner`, not `supabase.functions.invoke`. It binds the token to one user id, refreshes once on a 401, and returns an outcome instead of throwing. It returns `needs_sign_in` only when the auth server rejects the session (a 4xx other than 429). A 429, a 5xx or a network failure is `retryable`.
- `platform/supabase.ts` wraps `fetch` so auth calls time out after `REQUEST_TIMEOUT_MS`. Refresh-token grants are excluded from the timeout.
- 429 handling is shared in `platform/rate-limit.ts`. A database `PT429` from a client write goes through `withFriendlyRateLimit` or `rateLimitedMessage`.
- Users never see a raw error code or database text. Every failure maps to a sentence, with a generic fallback (`programErrorText`, `pinProblemText`, the account export and delete messages).
- `emailChangeProblem` does not use `authErrorMessage` on purpose: `authErrorMessage` would call a 403 an invalid link.
- A password change re-checks the current password against the email `getUser()` returns now, not a cached one. Only `invalid_credentials` means the password was wrong.
- Row shapes are hand-written zod `*RowSchema`s (`*Row` is inferred) beside the `*_COLUMNS` strings; update both on a schema change. Every server read goes through `parsedRows`/`parsedRow` (`rows.ts`), never a cast; a malformed answer fails with `UNREADABLE_ROWS_TEXT`. Enums are strict, so an older cached PWA rejects a row with a new server value and falls back to its saved copy: ship the client value a release before the server writes it. Numerics may arrive as strings (`numericColumn`); coerce with `Number(...)`.

### Must stay in sync with SQL

- `MINIMUM_PASSWORD_LENGTH` (12) is also set in `supabase/config.toml`. Import it from `platform/auth-links.ts`.
- `nameProblem` rejects blank names, control characters and bidi controls (U+202A to U+202E, U+2066 to U+2069). It counts length in code points, like `char_length`. The display name check in migration 036 restates the same rules.
- `trimNote` trims JS whitespace plus U+0085. That is the same set `save_exercise_note` trims since migration 038.
- The row types in `programs/program-facts-rules.ts` match migration 023.
- `followStatus` mirrors `private.compiled_program_definition`:
  - A planned progression counts as `none` when the exercise's load type is not `external`.
  - While the load type is still unknown (the status is `undecided` until exercises load), the planned progression is kept.
  - This stops a load type change from leaving the status stuck.
- `collection/challenge-rules.ts` volume rounds each weight to 2 decimals, as the server stores it, and bodyweight counts nothing. It shows the target as met only within the judge's `FLOAT_TOLERANCE`. `challengeLoadKg` rounds up, the way `roundPrescribedLoad` rounds program loads down.
- Exercise progress and bodyweight trend:
  - `progress/exercise-progress-rules.ts` uses RIR for e1RM only when `rir_source` is `logged`.
  - `progress/plateau-rules.ts` never flags a lift whose latest session a program drove (`prescription_ref`), so it cannot second-guess the program's deloads.
  - `PROGRESS_PAGE_SIZE` (1000) is the PostgREST `max_rows`. `queryProgressSets` keeps paging until it gets a short page; otherwise long histories lose their oldest sessions.
  - `progress/bodyweight-trend.ts` reads newest first, so a row cap drops the oldest days.
- `BODYWEIGHT_LOAD_NOT_ZERO_CODE` and `UNKNOWN_EXERCISE_CODE` (in `workout/exercise-edit-rules.ts`) are mapped by both the finish flow and the history save.

### Query cache

- `createQueryClient` has no retries and uses `networkMode: 'always'`. A failed or offline load then shows its problem at once instead of waiting on the skeleton; supabase-js already retries GETs. `tests/web/query-client.test.ts` pins this.
- `FRESH_FOR_MS` (60 s) only limits how long changes from other devices take to show. Every write this device makes to queried data must call `announceDataChange` (`query/data-changes.ts`). It invalidates locally and broadcasts on `gainscape.data-changes`.
- Every query factory is defined in `query/queries.ts` and listed in `EVERY_QUERY`, and its root is in `QUERY_ROOTS_CHANGED_BY` or `ALWAYS_STALE_QUERY_ROOTS`. `tests/web/query-freshness-rules.test.ts` fails on a `*Query` export missing from either.
- The tab that made a write skips the roots it already updated optimistically (profile, items after a craft, weekly goal, pins). This stops a refetch that started before a second optimistic write from undoing it. Optimistic writes call `cancelQueries` before `setQueryData`.
- `account-reset` resets the roots instead of invalidating them, so no screen shows pre-reset data while it refetches.
- A cache-first result with `fromCache: true` gets a `staleTime` of 0, so it is retried on the next visit and on reconnect. Everything is stale while the device is offline.
- Always stale:
  - friends, feed, hiscores and friend profile, because other people change them;
  - program templates and enroll choices, because their cache-first loaders drop `fromCache`;
  - the first-run training history check, so the intro never comes back after a first workout.
- Program saves, copies and deletes call `showChangedPrograms`: it puts the saved list into `programsQuery` and announces `programs-changed`.
- These writes need no announcement: enrollment writes (no query reads enrollments), program publishing (`publishForEnroll` removes the enroll choices) and friend actions.
- A finished workout refreshes every tab through `useDataChangeInvalidation`, which listens for `synced` and `deleted` on the `gainscape.drafts` channel. The finish flow has no hook of its own.
- Query keys carry the user id, and `App.tsx` clears the client when the user changes.
- Some keys sit under another key on purpose, so invalidating or removing the parent covers them too:
  - `feedPreviewQuery` under `FEED_QUERY_PREFIX`
  - `recentSetsQuery` under `['history', userId]`
  - `ownedPetsQuery` under `['items', userId, 'pets']`
- `loadedState` keeps showing data after a failed background refresh. TanStack Query v5 sets status `error` but keeps the data.

### Device storage and offline

- Per-user keys follow `gainscape.<name>[.vN].<userId>` (`gainscape.last-summary` and `gainscape.chunk-reload-at` are not per user). To change a stored shape, bump the version and remove the retired keys (`exercises/catalog-cache.ts` drops v1 and v2). Parse stored JSON defensively (zod, or a guard via `parsedJson`), because it can be stale, corrupt or another user's.
- Per-user `Storage` records go through `keyedStore(prefix, parse, format?)` in `platform/keyed-store.ts`: `read` never throws and falls back to `parse(null, userId)`, `save` and `forget` swallow storage errors. Never hand-roll a store. Get storage from `deviceStorage()`/`tabStorage()` there (null when blocked).
- Every new per-user `gainscape.` key needs two changes:
  - `tests/web/user-device-data.test.ts` must write it. The test scans `web/src` for key names and fails on a key it does not write.
  - `forgetUserDeviceData` in `../offline/user-device-data.ts` must forget it.
- The companion pet survives `forgetUserProgressData` but not `forgetUserDeviceData`.
- Stores never throw:
  - Blocked storage reads as the defaults, and `deviceStorage()` returns null.
  - `readOnboarding` and `readLastSeenRelease` write the value back to tell `absent` from `unavailable`.
  - A blocked notify prompt counts as answered, so the prompt never nags.
- Only `exerciseListLoadQuery` reads and writes the exercise cache (`loadExercisesCacheFirst`); imperative code uses `fetchQuery` or `fetchLatestExerciseList`. The cache holds every exercise, archived ones included. Every reader that wants the training list applies `activeExercises`. A cached activity without `tracksDistance` reads as true.
- Offline, fetchers fail at once (`failFastWhenOffline`, `OfflineError`), and cache-first loaders show the saved copy without sending a request. `useOnlineSignal` (`platform/use-online.ts`) gives loaders a reconnect counter to reload on.

### Browser behaviour

- `useRouteFocusAndTitle` moves focus only when the pathname changes.
  - It waits up to 3 s for a `main` without `aria-busy`, then polls until the `h1` really has focus.
  - It leaves focus alone while a `dialog[open]` is showing, or when focus is already inside `main`.
  - It saves the scroll position per location key, so Back returns to the same place.
- `playTones` plays only if a suspended `AudioContext` resumes within 500 ms, so a frozen page never beeps late. Every device call is guarded with try/catch.
- `restAlertIsFresh` gives a 5 s grace, so a page that thaws late stays quiet. `claimRestAlert` lets only one tab alert per rest.
- `platesPerSide` loads the heaviest plates first, like a gym, and falls back to the fewest plates when that fails. It is not greedy.
- React keys for repeated exercises come from `exerciseKeys`; workout cards key by the draft's `clientId`.
- The enroll form is generated from the template definition, with no code per program. Custom templates bind `x_<exercise hex>` lifts, and a `<lift>Lift` option picks a lift's key. Archived and custom exercises never bind.

## Testing

- Run `make test-web` (no stack), or one file with `npx vitest run tests/web/<name>.test.ts`. A new rules module gets `tests/web/<module>.test.ts`. Real queries and RPCs are tested in `tests/integration/`, screen behaviour in `e2e/`.
- Tests whose file name does not match the module are listed in `tests/web/AGENTS.md`.
- These have no direct unit test: `profile/account.ts` (except `changePassword`), `exercises/custom-exercises.ts`, `platform/function-client.ts`, `collection/items.ts`, `progress/skill-map.ts`, `progress/standing.ts`, `platform/use-auth-session.ts`, and `platform/device-effects.ts` and `platform/celebration-effects.ts` (covered by e2e only). When you change logic in one of them, move the decision into a pure function and test that.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
