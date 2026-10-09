# _shared

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-07

## Purpose

Code shared by every Edge Function: request authentication, the Postgres client, HTTP/CORS helpers, rate limiting, deterministic loot seeding and the common set payload schema. The pure game engine (`domain/`) and the SQL access layer (`stores/`) live in subdirectories.

## Key Files

| File                     | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api-keys.ts`            | `secretKey()` and `publishableKey()` read the `default` entry of the `SUPABASE_SECRET_KEYS` / `SUPABASE_PUBLISHABLE_KEYS` JSON maps the runtime injects. A missing or malformed map, or a default key that is not a whole `sb_secret_` / `sb_publishable_` key, is 500 `api_key_missing`. Callers read keys per request, never at module load, so the error goes through `errorResponse`. The legacy `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are never read |
| `auth.ts`                | `authenticatedUserId(request)`: verifies the bearer JWT with `auth.getClaims` on a publishable-key client created on first use, requires role `authenticated`, else 401 `missing_token`/`invalid_token`                                                                                                                                                                                                                                                                 |
| `db.ts`                  | Exports `sql` (postgres.js on `SUPABASE_DB_URL`, `prepare: false`, `max: 3`), `Transaction`, `JsonValue`, `DbRow`, `pgErrorCode` and the row helpers `nullableNumber` and `isoTimestamp`                                                                                                                                                                                                                                                                                |
| `http.ts`                | `corsHeaders`, `HttpError(status, code, details)`, `jsonResponse`, `errorResponse` (unknown errors become 500 `internal_error` and are logged through `logUnexpectedError`, the one reviewed log line `rebuild-caches` also uses; 429 adds `Retry-After`)                                                                                                                                                                                                               |
| `http-errors.ts`         | `asHttpError` maps unique violations to 409 and domain errors (bodyweight, unknown exercise) to HTTP errors                                                                                                                                                                                                                                                                                                                                                             |
| `rate-limit.ts`          | `takeRateLimit(runner, bucket, userId)` calls `private.take_rate_limit`; maps `PT429` to 429 `rate_limited` and FK violation to 404 `profile_not_found`. Defines `RateLimitBucket`                                                                                                                                                                                                                                                                                      |
| `loot-seeds.ts`          | `lootSecret()` (reads `LOOT_SECRET`, min 32 chars, else 500 `loot_secret_missing`) and `lootRngFor` (HMAC-SHA-256 seeds to sfc32 RNGs)                                                                                                                                                                                                                                                                                                                                  |
| `serve.ts`               | `serve(handler, mapError?)`: OPTIONS 204 with CORS, 405 for non-POST, thrown errors through `errorResponse`                                                                                                                                                                                                                                                                                                                                                             |
| `serve-authenticated.ts` | `serveAuthenticated(parse, handle)` for user-token JSON endpoints: `authenticatedUserId`, `readJsonBody`, `parse`, `handle` through `serve` with `asHttpError`                                                                                                                                                                                                                                                                                                          |
| `service-auth.ts`        | `assertSecretKey`: constant-time compare of the `apikey` header to the default secret key, ignoring `Authorization`, else 403 `secret_key_required`                                                                                                                                                                                                                                                                                                                     |
| `session-payload.ts`     | Zod `setSchema` (lift sets with an optional strict `prescription`, and cardio bouts, with their effort schemas), `lowerUuid`, `parseOr422` (422 `invalid_payload`), `assertDistinctSetIdsAndPositions` (422 `duplicate_set_id`/`duplicate_set_position`) and `assertDistinctPrescriptionRefs` (422 `duplicate_prescription_ref`, edit only), shared by complete and edit; derives a bout's `durationS` with `boutDurationSeconds`                                       |

## Subdirectories

| Directory | Purpose                                                                                   |
| --------- | ----------------------------------------------------------------------------------------- |
| `domain/` | Pure TypeScript game engine shared with the web app (see `domain/AGENTS.md`)              |
| `stores/` | SQL access for catalog, sessions, replay, loot, records and more (see `stores/AGENTS.md`) |

## For AI Agents

### Working In This Directory

- Top-level files may use `Deno` and `npm:` imports. `domain/` may not (purity rule).
- A new rate-limit bucket needs the TypeScript union in `rate-limit.ts` and the SQL in a new migration.
- Error codes are part of the API contract tested by integration tests and used by the web client. Do not rename them casually.
- `session-payload.ts` limits (weight 0 to 2000, reps 1 to 100, position 0 to 999) must match web validation.
- Changes here affect all six functions; run `make check-functions`.

### Testing Requirements

- `loot-seeds.ts` is covered by `tests/domain/loot-seeds.test.ts`; `api-keys.ts` and `service-auth.ts` by `tests/deploy/api-keys.test.ts` (both stub `Deno`).
- `http.ts`, `rate-limit.ts`, `auth.ts` and `session-payload.ts` have no unit tests; they are covered through `tests/integration/` (`rate-limits.test.ts`, `complete-session.test.ts`, `edit-session.test.ts`, `rebuild-caches.test.ts`). Add the failing integration test there; the stack is required.

### Common Patterns

- Throw `HttpError`, never build error responses by hand.
- Lowercase UUIDs via `.transform((id) => id.toLowerCase())`.

## Dependencies

### Internal

- `domain/`, `stores/`, every function directory

### External

- `npm:zod@4.6.5`, `npm:postgres@3.4.9`, `npm:@supabase/supabase-js@2.117.2`

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
