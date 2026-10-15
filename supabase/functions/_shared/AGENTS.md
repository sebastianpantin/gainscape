# _shared

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

Code shared by every Edge Function: request authentication, the Postgres client, HTTP and CORS helpers, rate limiting, deterministic loot seeding and the common set payload schema. The pure game engine (`domain/`) and the SQL access layer (`stores/`) have their own `AGENTS.md`.

## Map

- Entry wrappers: `serve.ts` (OPTIONS 204 with CORS, 405 for non-POST, thrown errors through `errorResponse`) and `serve-authenticated.ts` (user-token JSON endpoints: auth, body, parse, handle).
- Auth: `auth.ts` (user JWT), `service-auth.ts` (secret key), `api-keys.ts`, `token-check.ts`.
- `db.ts`: the postgres.js client and row helpers. `http.ts` and `http-errors.ts`: `HttpError` and error mapping.
- `session-payload.ts`: the zod set schema shared by `complete-session` and `edit-session`.
- `rate-limit.ts`, `loot-seeds.ts`.

## Rules and gotchas

- Top-level files may use `Deno` and `npm:` imports; `domain/` may not.
- Keys come from the `default` entry of the `SUPABASE_SECRET_KEYS` / `SUPABASE_PUBLISHABLE_KEYS` JSON maps. Read them per request, never at module load, so a missing key becomes a 500 `api_key_missing` through `errorResponse` (`tests/deploy/function-secrets.test.ts` checks this). The legacy `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are never read.
- `assertSecretKey` compares the `apikey` header in constant time and ignores `Authorization`.
- `tokenCheckFailure`: a 4xx other than 429 is 401 `invalid_token`; a rate limit, 5xx or network failure is logged and becomes 503 `auth_unavailable`, so an auth outage never signs the client out.
- `db.ts` uses `prepare: false` and `max: 3` on `SUPABASE_DB_URL`.
- `errorResponse` turns unknown errors into 500 `internal_error`, logged through `logUnexpectedError`, the one reviewed log line (also used by `rebuild-caches`). A 429 adds `Retry-After`. Throw `HttpError`; never build error responses by hand.
- `asHttpError` maps a unique violation of a client-chosen id (`sessions_pkey`, `sets_pkey`, `deleted_sessions_pkey`, a race with another writer) to 409 `id_conflict`; every other unique violation stays a 500.
- Error codes are API contract, used by the web client and pinned by integration tests. Do not rename them casually.
- A new rate-limit bucket needs the `RateLimitBucket` union and the SQL in a new migration. `PT429` maps to 429 `rate_limited`, an FK violation to 404 `profile_not_found`. Take the limit right after `lockUser` and the free idempotent answers (resubmission, tombstone retry, no-op edit, started quest), before catalog, profile or replay reads, so a capped client costs one cheap transaction. The hit is written inside the transaction, so a later 4xx rolls it back and only a committed write counts.
- `session-payload.ts` limits (load up to `MAX_SET_LOAD_KG`, reps up to `MAX_SET_REPS`, position 0-999, `HOLD_BOUNDS`) come from domain constants the web set editors share. `sessionNotes` strips NUL characters because Postgres text rejects them. A bout's `durationS` is derived on the server. UUIDs are lowercased in the schema.
- `LOOT_SECRET` must be at least 32 characters (else 500 `loot_secret_missing`); seeds are HMAC-SHA-256 into sfc32, so loot is reproducible per user and set.
- Changes here affect every function: run `make check-functions`.

## Testing

- Unit (no stack): `loot-seeds.ts` in `tests/domain/loot-seeds.test.ts`; `api-keys.ts`, `service-auth.ts` and `token-check.ts` in `tests/deploy/` (they stub `Deno`).
- Everything else through `tests/integration/` (stack): add the failing integration test there.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
