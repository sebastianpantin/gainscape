# delete-session

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

POST endpoint that deletes a session inside the edit window, records a tombstone in `public.deleted_sessions`, replays later sessions and returns revoked drops. Deleting an already-tombstoned id is idempotent.

## Map

- `index.ts`: strict `{ sessionId, ifRevision? }`, bucket `session_delete_hour`. `deno.json`, `deno.lock` (never hand-edit).

## Rules and gotchas

- The tombstone is what makes a later `complete-session` of the same id answer 410 `session_deleted`. Keep both in sync.
- `ifRevision` is optional so older clients still delete. A mismatch is 409 `revision_conflict` with `{ revision }`, checked after the tombstone lookup so a retried delete stays idempotent.
- 404 `session_not_found`, 409 `edit_window_closed`.

## Testing

`tests/integration/delete-session.test.ts`, `loot-revocation.test.ts`, `account.test.ts` (stack).

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
