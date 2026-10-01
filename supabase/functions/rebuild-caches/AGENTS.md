# rebuild-caches

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-01

## Purpose

Service-role-only POST endpoint that wipes a user's derived records and replays all their sessions with the current balance version, then stamps `derived_balance_version`. Used after balance changes and to backfill feed events (`make rebuild-caches`).

## Key Files

| File        | Description                                                                                                                       |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`  | Handler; `assertServiceRole`, body `{ userId }`, 404 `user_not_found`, returns sessions replayed, sets rewritten, balance version |
| `deno.json` | `{ "nodeModulesDir": "none" }`; picked up by `make check-functions`                                                               |
| `deno.lock` | Pinned dependency lock; regenerate with Deno, do not hand-edit                                                                    |

## For AI Agents

### Working In This Directory

- Not callable by end users; 403 `service_role_required` without the service key.
- Run via `make rebuild-caches` (calls `scripts/rebuild-caches.mjs`).

### Testing Requirements

`tests/integration/rebuild-caches.test.ts`. Stack required.

### Common Patterns

Handler is thin: OPTIONS, POST check, auth, parse, one async function, `errorResponse`. No comments in code.

## Dependencies

### Internal

- `../_shared/service-auth.ts`, `db.ts`, `domain/`, `stores/replay.ts`; `scripts/rebuild-caches.mjs`

### External

- Deno 2, `npm:zod@4.6.5`, `npm:postgres@3.4.9`

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
