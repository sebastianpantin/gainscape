# functions

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

Deno Edge Functions served locally by `make functions` (`npx supabase functions serve --env-file supabase/functions/.env.local`). `_shared/` holds code common to all functions, including the pure game engine in `_shared/domain/`. Each function directory has its own `AGENTS.md`.

## Rules and gotchas

- Each function directory has its own `deno.json` (`{ "nodeModulesDir": "none" }`) and `deno.lock`. `make check-functions` type-checks only directories with a `deno.json`, so a new function needs one.
- Imports use `npm:` specifiers with exact versions and the `.ts` extension. Keep versions identical across functions.
- `.env.local` (gitignored, never commit) holds `LOOT_SECRET`. `make functions` creates it via `scripts/ensure-loot-secret.mjs` and restarts the server when its checksum changes. The server writes `.functions-serve.pid`, `.log` and `.stamp` at the repo root.
- Handlers use `serve` or `serveAuthenticated` from `_shared/` (OPTIONS 204 with CORS, 405 for non-POST, thrown errors through `errorResponse`). Keep handlers thin.
- Writers (`complete-session`, `edit-session`, `delete-session`, `rebuild-caches`, `start-quest`) run in `sql.begin` after `lockUser`, so concurrent writes for one user serialize. `export-data` uses a repeatable-read, read-only transaction.

## Testing

- `make test-integration` (starts functions) runs `tests/integration/`; `make check-functions` for types. Pure logic goes in `_shared/domain` with `tests/domain/`.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
