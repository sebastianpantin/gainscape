# functions

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-01

## Purpose

Deno Edge Functions served locally by `make functions` (which runs `npx supabase functions serve --env-file supabase/functions/.env.local`). `_shared/` holds code common to all functions, including the pure game engine in `_shared/domain/`.

## Subdirectories

| Directory           | Purpose                                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| `_shared/`          | Auth, db, HTTP helpers, rate limiting, loot seeds, payload schemas, domain and stores (see `_shared/AGENTS.md`) |
| `complete-session/` | Syncs a finished workout draft (see `complete-session/AGENTS.md`)                                               |
| `edit-session/`     | Edits a session inside the edit window (see `edit-session/AGENTS.md`)                                           |
| `delete-session/`   | Tombstones and replays (see `delete-session/AGENTS.md`)                                                         |
| `delete-account/`   | Password-confirmed account deletion (see `delete-account/AGENTS.md`)                                            |
| `export-data/`      | Full user data export (see `export-data/AGENTS.md`)                                                             |
| `rebuild-caches/`   | Service-role replay of a user's caches (see `rebuild-caches/AGENTS.md`)                                         |

## For AI Agents

### Working In This Directory

- Each function dir has its own `deno.json` (`{ "nodeModulesDir": "none" }`) and `deno.lock`. `make check-functions` runs `deno check --config <dir>/deno.json <dir>/index.ts` for each dir that has a `deno.json`, so a new function needs one to be type-checked.
- Imports use `npm:` specifiers with exact versions (`npm:zod@4.6.5`, `npm:postgres@3.4.9`, `npm:@supabase/supabase-js@2.117.2`) and the `.ts` extension. Keep versions identical across functions.
- `.env.local` (gitignored) holds `LOOT_SECRET`. `scripts/ensure-loot-secret.mjs`, called by `make functions`, creates it with a random 32-byte hex secret (mode 0600) or fails if the secret is shorter than 32 characters. `make functions` restarts the server when the file's checksum changes. Never commit it.
- The server writes `.functions-serve.pid`, `.functions-serve.log` and `.functions-serve.stamp` at the repo root.
- Every function answers `OPTIONS` with 204 and CORS headers, then rejects non-POST with 405.
- No comments in code (lint rule).

### Testing Requirements

Integration tests in `tests/integration/` call the served functions; run `make test-integration` (starts functions). Run `make check-functions` for types. Pure logic goes in `_shared/domain` with `tests/domain/`.

### Common Patterns

- Handler shape: `serve(handler, mapError?)` from `_shared/serve.ts` wraps `Deno.serve`, answers OPTIONS, rejects non-POST with 405 and turns thrown errors into `errorResponse` (pass `asHttpError` to map domain errors). `serveAuthenticated(parse, handle)` from `_shared/serve-authenticated.ts` adds the common case on top: `authenticatedUserId`, `readJsonBody`, the zod `parse`, then `handle(userId, payload)` as JSON with `asHttpError`; complete-session, edit-session, delete-session and delete-account use it. `rebuild-caches` uses `serve` with `assertServiceRole`, `export-data` uses `serve` with `authenticatedUserId`.
- `complete-session`, `edit-session` and `delete-session` write in `sql.begin` after `lockUser`. `rebuild-caches` also calls `lockUser` inside `sql.begin`, passing its own 404 `user_not_found` error. `export-data` uses a read-only transaction. `delete-account` uses neither.

## Dependencies

### Internal

- `../migrations/`, `tests/integration/`, `scripts/ensure-loot-secret.mjs`, `scripts/wait-for-functions.mjs`

### External

- Deno 2, Supabase CLI, zod, postgres, supabase-js

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
