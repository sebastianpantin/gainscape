# start-quest

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-14 · **Updated:** 2026-10-14

## Purpose

POST endpoint that starts a quest for the caller by inserting a `quest_progress` row. Progress itself only moves in `complete-session`.

## Map

- `index.ts`: strict `{ questId }`, bucket `quest_start_hour`. `deno.json`, `deno.lock` (never hand-edit).

## Rules and gotchas

- Order of checks: 404 `quest_not_found` (unknown or retired), 409 `quest_completed`, then an already started quest answers its progress with 200 before the rate limit, so a retry is free. Only then the rate limit and 409 `quest_requirements_not_met` with `{ missing }` from the domain `questStartProblems`.
- `started_at` is the database time. Only sessions that end after it count (domain `sessionCountsForQuest`), so a draft begun before the quest still counts if it ends later.

## Testing

`tests/integration/quests.test.ts`, `quest-retirement.test.ts` (stack).

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
