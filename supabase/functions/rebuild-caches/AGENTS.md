# rebuild-caches

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-07

## Purpose

Admin-only POST endpoint, called with the project's default secret key, that wipes a user's derived records (strength, rep maxes, bodyweight and cardio records) and replays all their sessions with the current balance version, then stamps `derived_balance_version`. Used after balance changes and to backfill feed events (`make rebuild-caches`).

## Key Files

| File        | Description                                                                                                                                                                                        |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`  | Handler; `assertSecretKey`, strict body `{ userId }` (400 `invalid_json`, 422 `invalid_payload`), `lockUser` with 404 `user_not_found`, returns sessions replayed, sets rewritten, balance version |
| `deno.json` | `{ "nodeModulesDir": "none" }`; picked up by `make check-functions`                                                                                                                                |
| `deno.lock` | Pinned dependency lock; regenerate with Deno, do not hand-edit                                                                                                                                     |

## For AI Agents

### Working In This Directory

- Not callable by end users; 403 `secret_key_required` unless the `apikey` header holds the default secret key. The `Authorization` header is ignored.
- `supabase/config.toml` sets `verify_jwt = false` for this function, because a secret key is not a JWT and the gateway would refuse it. `assertSecretKey` is the only gate.
- Run via `make rebuild-caches` (calls `scripts/rebuild-caches.mjs`).

### Testing Requirements

`tests/integration/rebuild-caches.test.ts`. Stack required.

### Common Patterns

Handler is thin: OPTIONS, POST check, auth, parse, one async function, `errorResponse`. No comments in code.

## Dependencies

### Internal

- `../_shared/service-auth.ts`, `api-keys.ts`, `db.ts`, `domain/`, `stores/replay.ts`; `scripts/rebuild-caches.mjs`

### External

- Deno 2, `npm:zod@4.6.5`, `npm:postgres@3.4.9`

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
