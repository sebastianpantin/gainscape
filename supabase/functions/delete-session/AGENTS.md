# delete-session

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-01

## Purpose

POST endpoint that deletes a session within the edit window, records a tombstone in `public.deleted_sessions`, replays later sessions and returns revoked drops. Deleting an already-tombstoned id is idempotent.

## Key Files

| File        | Description                                                                                                                                              |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`  | Handler with strict `{ sessionId }` schema, `deleteSession` transaction, 404 `session_not_found`, 409 `edit_window_closed`, bucket `session_delete_hour` |
| `deno.json` | `{ "nodeModulesDir": "none" }`; picked up by `make check-functions`                                                                                      |
| `deno.lock` | Pinned dependency lock; regenerate with Deno, do not hand-edit                                                                                           |

## For AI Agents

### Working In This Directory

- The tombstone insert is what makes later `complete-session` of the same id return 410. Keep both in sync.

### Testing Requirements

`tests/integration/delete-session.test.ts` (also `loot-revocation.test.ts`, `account.test.ts`). Stack required.

### Common Patterns

Handler is thin: OPTIONS, POST check, auth, parse, one async function, `errorResponse`. No comments in code.

## Dependencies

### Internal

- `../_shared/` (auth, db, http, rate-limit, replay and sessions stores, domain)

### External

- Deno 2, `npm:zod@4.6.5`, `npm:postgres@3.4.9`

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
