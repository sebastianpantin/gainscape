# lib

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-01

## Purpose

`web/src/lib/` is the web app's non-visual layer: Supabase client setup, auth boot and sign-out logic, typed fetchers and RPC wrappers for every feature, and the pure rule modules those fetchers lean on. Files split into two kinds. Pure modules (`*-rules.ts`, `units.ts`, `format.ts`, `names.ts`, `rate-limit.ts`, `auth-links.ts`, `auth-restore.ts`, `catalog-cache.ts`) hold decisions and are unit tested in `tests/web/` without a stack. I/O modules (`catalog.ts`, `items.ts`, `history.ts`, `social.ts`, `profile.ts`, `programs.ts`, `collection-data.ts`, `custom-exercises.ts`, `account.ts`) talk to Supabase through the shared `supabase` client or Edge Functions and stay thin. React components and hooks live elsewhere; the only React imports here are the context in `preferences.ts` and the two hooks `standing.ts` and `use-auth-session.ts`.

## Key Files

| File                                                | Description                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase.ts`                                       | Creates the single `supabase` client. URL comes from `VITE_SUPABASE_URL` or falls back to the same-origin `/sb` proxy. Wraps `fetch` so auth calls time out after `REQUEST_TIMEOUT_MS` (refresh-token grants excluded).                                                                                               |
| `auth-restore.ts`                                   | Pure auth boot and sign-out logic: `bootAuth` (offline fallback to the stored session after `AUTH_FALLBACK_MS`), `signOutOnThisDevice`, `storedSessionFrom` (zod-validates the persisted token), `onForcedSignOut`/`forceSignedOut`, `needsAuthTimeout`, `authStorageKey`. All side effects arrive as injected ports. |
| `use-auth-session.ts`                               | React hook `useAuthSession` that wires `bootAuth` to `supabase.auth` and `localStorage`; returns `AuthState` (`loading`, `signed-out`, `signed-in` with an `offline` flag).                                                                                                                                           |
| `function-client.ts`                                | `invokeAsOwner`: calls an Edge Function with a bearer token bound to one user id, refreshes once on 401, and returns an `InvokeOutcome` (`ok`, `http_error`, `needs_sign_in`, `wrong_account`, `retryable`) instead of throwing. Also `retryDelayMs` (exponential, capped at 30 s).                                   |
| `rate-limit.ts`                                     | Pure helpers for HTTP 429 handling: `RATE_LIMITED_STATUS`, `RATE_LIMITED_CODE`, `retryAfterSeconds`, `waitText`, `tryAgainIn`.                                                                                                                                                                                        |
| `auth-links.ts`                                     | Pure: `authCallbackUrl`, `parseAuthCallback` for `/auth/confirm` links, `authErrorMessage`, `AUTH_MESSAGES`, resend cooldown and username-change window constants, `confirmedRecently`.                                                                                                                               |
| `account.ts`                                        | Password change, email change, data export (`exportMyData`, `saveBlob`) and account deletion via Edge Functions; maps rate-limit errors with `tryAgainIn`.                                                                                                                                                            |
| `catalog.ts`                                        | Types (`Skill`, `Exercise`, `LoadType`, `Equipment`, `LOAD_TYPES`, `EQUIPMENT`) and fetchers for skills, exercises, skill XP and bodyweight.                                                                                                                                                                          |
| `catalog-cache.ts`                                  | Pure offline cache of the exercise list in `Storage` under `gainscape.exercises.v1.<userId>`: zod-checked read, save, forget, `isNetworkError`, and `loadExercisesCacheFirst` with its offline notices.                                                                                                               |
| `custom-exercises.ts`                               | RPC wrappers for user-created exercises: save, archive, skill shares, `hasLoggedSet`, and the `NAME_TAKEN_MESSAGE`.                                                                                                                                                                                                   |
| `names.ts`                                          | Pure `trimmedName` and `nameProblem` shared by name inputs.                                                                                                                                                                                                                                                           |
| `items.ts`, `item-rules.ts`                         | `items.ts` fetches the item catalog and inventory and calls `craftItem`. `item-rules.ts` is pure: column lists (`ITEM_COLUMNS`, `RECIPE_COLUMNS`, `INVENTORY_COLUMNS`), row mappers, tier colours, grouping, `craftProblem`, `describeDrops`.                                                                         |
| `collection-data.ts`, `collection-rules.ts`         | Collection log. `collection-data.ts` fetches rep-max slots, strengths and pins and re-exports `countCollection`; `collection-rules.ts` is the pure counter built on `@domain/collection.ts`.                                                                                                                          |
| `history.ts`, `history-rules.ts`                    | Workout history. `history.ts` binds `supabase` and calls `edit-session` / `delete-session` through `invokeAsOwner` with automatic retries. `history-rules.ts` holds row types, mappers, paging filter and the `query*` functions, which take the client as a parameter so integration tests can pass their own.       |
| `profile.ts`, `profile-rules.ts`, `profile-view.ts` | `profile.ts` fetches and updates the profile and changes the timezone. `profile-rules.ts` is pure: types (`Profile`, `UnitPref`, `EffortInputMode`, `BadgeColor`), limits and validators. `profile-view.ts` derives card data from a friend's `ProfileView`. `profile.ts` re-exports `profile-rules.ts`.              |
| `preferences.ts`                                    | `PreferencesContext`, `usePreferences`, and a `localStorage` cache (`gainscape.preferences.<userId>`) so unit and effort mode work offline.                                                                                                                                                                           |
| `units.ts`, `format.ts`                             | Pure kg/lb and cm/ft-in conversion and formatting; `formatLoad` renders a set load by `LoadType`.                                                                                                                                                                                                                     |
| `programs.ts`                                       | Fetches, saves, copies and deletes programs through RPCs, keeps an in-memory per-user cache (`cachedPrograms`), and `fetchLastLoggedSets`. Imports planning types from `../offline/draft-format.ts`.                                                                                                                  |
| `social.ts`, `social-rules.ts`                      | Friends, feed, gz, hiscores and profile/collection views. `social-rules.ts` is pure: feed text and badges, cursor, `relativeTime`, request-status text, `hiscoreValue`, `rankHiscores`.                                                                                                                               |
| `standing.ts`                                       | Total and combat level from skill XP using `@domain/index.ts`; `useStanding` hook.                                                                                                                                                                                                                                    |
| `database.types.ts`                                 | Generated by `make types` from the local schema. It is listed in `.prettierignore` and the ESLint ignores but is absent from the working tree and git, and no source file imports it yet; never hand-edit it.                                                                                                         |

## For AI Agents

### Working In This Directory

- **Keep the pure/I/O split.** A decision (validation, text, ordering, mapping, retry policy) goes in a pure module and gets a test; the I/O module only fetches and calls the pure function. Modules that must be testable without a browser take their dependencies as arguments (`querySessionPage(client, ...)`, `bootAuth(ports)`, `signOutOnThisDevice(ports)`, `readCachedExercises(storage, ...)`) instead of importing `supabase` or `localStorage`.
- **Never import `supabase.ts` from a `*-rules.ts` or other pure module.** It reads `window.location` and `import.meta.env` at import time and breaks plain Vitest runs. `history-rules.ts` shows the pattern: it only imports `SupabaseClient` as a type.
- **Never hand-edit `database.types.ts`.** Regenerate with `make types` after `make reset`. Types for rows currently come from hand-written `*Row` interfaces in each module, so a schema change needs those interfaces and the `*_COLUMNS` select strings updated by hand too.
- **Call Edge Functions with `invokeAsOwner`,** not `supabase.functions.invoke`, whenever an account switch or an expired token would be harmful. It returns outcomes rather than throwing; callers branch on `kind`.
- **429 handling is shared.** Use `RATE_LIMITED_STATUS`, `retryAfterSeconds` and `tryAgainIn` from `rate-limit.ts` rather than parsing `retryAfterSeconds` again.
- **Offline-readable data uses versioned storage keys** (`gainscape.exercises.v1.`, `gainscape.preferences.`). Parse stored JSON defensively (zod or a type guard, `try`/`catch`, return `null`), because it can be stale, corrupt or from another user.
- **Domain imports** use the `@domain/*` alias to `supabase/functions/_shared/domain/`. Keep the shared engine as the single source of rules for levels, strength and collection; do not reimplement them here.
- **Import with `.ts` extensions and inline `type` imports.** No comments in code (`gainscape/no-comments`).
- `profile.ts` and `collection-data.ts` re-export their rules module so features import from one place; keep that re-export when adding rules.

### Testing Requirements

Pure logic is covered by `make test-web` (`tests/web/`, no stack):

| Source                             | Tests                                                                            |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| `auth-restore.ts`                  | `tests/web/auth-session.test.ts`                                                 |
| `auth-links.ts`                    | `tests/web/auth-links.test.ts`, `tests/integration/auth-email.test.ts`           |
| `catalog-cache.ts`                 | `tests/web/catalog-cache.test.ts`                                                |
| `item-rules.ts`                    | `tests/web/items.test.ts` (also checks tiers and slots against the catalog YAML) |
| `history-rules.ts`, `history.ts`   | `tests/web/session-edit.test.ts`, `tests/integration/history-paging.test.ts`     |
| `social-rules.ts`, `rate-limit.ts` | `tests/web/social-rules.test.ts`                                                 |
| `profile-rules.ts`                 | `tests/web/profile.test.ts`                                                      |
| `units.ts`                         | `tests/web/units.test.ts`                                                        |
| `names.ts`                         | `tests/web/names.test.ts`                                                        |
| `catalog.ts`, `collection-*`       | only indirectly, via `tests/integration/collection-support.ts` and e2e flows     |

Write the failing test first in the matching `tests/web/*.test.ts` file (create `tests/web/<module>.test.ts` for a new rules module). Behaviour that needs a real query or RPC goes in `tests/integration/` (stack required, `make test-integration`); screen-level behaviour goes in `e2e/*.spec.ts` (`make e2e`). Files with no direct unit test today: `account.ts`, `custom-exercises.ts`, `function-client.ts` (`invokeAsOwner` and `retryDelayMs` are covered only by e2e `token-refresh.spec.ts`; `tests/web/finish-sync.test.ts` injects its own `send`), `items.ts`, `profile-view.ts`, `programs.ts`, `preferences.ts`, `standing.ts`, `format.ts`, `collection-rules.ts`, `use-auth-session.ts`. When you change logic in one of them, extract the decision into a pure function and test that.

### Common Patterns

- Fetchers throw the Supabase `error` (or `new Error(error.message)` after RPCs) and let the caller render the failure.
- Row interfaces use snake_case columns; mapper functions (`toCatalogItem`, `toHistorySession`, `toProgram`) convert to camelCase view types and coerce Postgres numerics with `Number(...)`.
- Select strings are exported constants (`ITEM_COLUMNS`, `SESSION_COLUMNS`) so tests can compare them to the schema.
- Ports objects (`SignOutPorts`, `AuthBootPorts`) carry `now` and timeouts as optional fields so tests can fake time.
- Discriminated unions with a `kind` or `status` field model outcomes (`InvokeOutcome`, `AuthState`, `SendRequestStatus`, `CraftProblem`).

## Dependencies

### Internal

- `@domain/*` (`supabase/functions/_shared/domain/`) for XP, levels, collection, crafting and types
- `../offline/draft-format.ts` (imported by `programs.ts`; `offline/` in turn imports `lib/catalog.ts`, `lib/function-client.ts`, `lib/rate-limit.ts`, `lib/supabase.ts`, `lib/auth-restore.ts`)
- `../components/pixel-sprites.ts` (type `ItemIconKind`, used by `item-rules.ts`)
- Consumed by `../features/`, `../components/`, `../App.tsx`

### External

- `@supabase/supabase-js` 2 (client, `FunctionsHttpError`, auth error guards)
- `zod` 4 (stored-session and exercise-cache validation)
- `react` 19 (context and hooks in `preferences.ts`, `standing.ts`, `use-auth-session.ts`)

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
