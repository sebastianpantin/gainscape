# edit-session

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-01

## Purpose

POST endpoint that edits notes and sets of an existing session within the edit window, using optimistic concurrency (`ifRevision`), then replays later sessions and reports revoked loot drops.

## Key Files

| File         | Description                                                                                                                                                                   |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`   | Handler; the domain `isNoOpEdit` skips unchanged edits, `writableSetFor` computes carried loads, returns `EditResponse` (summary, revision, replayedSessionIds, revokedDrops) |
| `payload.ts` | Strict zod `editSchema` and `parseEditSessionPayload`                                                                                                                         |
| `deno.json`  | `{ "nodeModulesDir": "none" }`; picked up by `make check-functions`                                                                                                           |
| `deno.lock`  | Pinned dependency lock; regenerate with Deno, do not hand-edit                                                                                                                |

## For AI Agents

### Working In This Directory

- Rate limit bucket `session_edit_hour`. Closed windows and history-only sessions are rejected.
- Session revision column comes from migration 006.

### Testing Requirements

`tests/integration/edit-session.test.ts` (also `loot-revocation.test.ts`, `events.test.ts`). Stack required.

### Common Patterns

Handler is thin: OPTIONS, POST check, auth, parse, one async function, `errorResponse`. No comments in code.

## Dependencies

### Internal

- `../_shared/` (auth, db, http, rate-limit, session-payload, domain, stores)

### External

- Deno 2, `npm:zod@4.6.5`, `npm:postgres@3.4.9`

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
