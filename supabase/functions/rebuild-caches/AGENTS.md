# rebuild-caches

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

Admin-only POST endpoint, called with the project's default secret key, that wipes a user's derived records and replays all their sessions with the current balance version, then stamps `derived_balance_version`. Used after balance changes and to backfill feed events (`make rebuild-caches`, `make rebuild-caches-hosted`).

## Map

- `index.ts`: three strict bodies: `{ userId }` (one user), `{ userIds }` (1 to 50 distinct ids, each in its own transaction) and `{ list: { scope: 'stale' | 'all', after, limit } }` (paging user ids). `deno.json`, `deno.lock` (never hand-edit).

## Rules and gotchas

- `assertSecretKey` is the only gate: 403 `secret_key_required` unless the `apikey` header holds the default secret key; `Authorization` is ignored. `supabase/config.toml` sets `verify_jwt = false` here because a secret key is not a JWT and the gateway would refuse it.
- In a `userIds` batch a user without a profile goes to `missing`. Any other error stops the batch with 500 `rebuild_failed` and `details: { userId, rebuiltBefore }`; the users before it stay rebuilt.
- The `list` mode exists because a hosted project grants `service_role` no table access, so the scripts ask this function for user ids. Both scripts page with `list` and rebuild with `userIds` through `rebuildThrough` in `scripts/function-batch.ts`.
- Rebuilding never revokes loot drops.

## Testing

`tests/integration/rebuild-caches.test.ts` (stack).

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
