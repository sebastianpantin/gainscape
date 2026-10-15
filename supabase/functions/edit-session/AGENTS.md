# edit-session

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

POST endpoint that edits the notes and sets of an existing session inside the edit window, with optimistic concurrency (`ifRevision`), then replays later sessions and reports revoked loot drops.

## Map

- `index.ts`: the handler. `payload.ts`: strict zod `editSchema`. `deno.json`, `deno.lock` (never hand-edit).

## Rules and gotchas

- Bucket `session_edit_hour`, taken right after the no-op answer and before any catalog or profile read. Closed edit windows and history-only sessions are rejected.
- The domain `isNoOpEdit` skips an unchanged edit (no write, no replay); a retried save gets that no-op answer.
- `unchangedSetIds` tells replay which sets keep drops rolled under older rules; it uses the same test as the web `dropsAtRisk` warning.
- Unlike `complete-session`, prescriptions are strict here: a malformed one is 422 `invalid_payload`, a ref repeated among added sets is 422 `duplicate_prescription_ref`.
- Kept sets keep their stored snapshot; a prescription sent for one is ignored. An added set stores a snapshot only when the session is linked and its ref is not a kept set's ref (removed sets are deleted first, so their refs are free).

## Testing

`tests/integration/edit-session.test.ts`, `program-sessions.test.ts`, `loot-revocation.test.ts`, `events.test.ts` (stack).

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
