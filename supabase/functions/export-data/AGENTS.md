# export-data

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-08

## Purpose

POST endpoint returning a JSON export of everything the caller owns (account, profile, sessions, sets, XP, records, custom exercises and more) from one read-only transaction. Export format version is `EXPORT_FORMAT_VERSION = 5` (2 added `cardioRecords`, 3 added `bodyweightEntries` with `logged_on` as a `YYYY-MM-DD` date, `bodyweight_kg` and `updated_at`, 4 added `weeklyGoals` with `effective_from` as a `YYYY-MM-DD` Monday, `goal` (null when off) and `updated_at`, 5 added `userLoadout` with `slot`, `item_id` and `equipped_at` and the gear XP semantics below).

Gear XP semantics since version 5:

- `sets.xp_awarded` is the base XP, before any gear bonus.
- `set_skill_xp.xp` includes the gear bonus, so it can exceed the set's `xp_awarded`.
- `sessions.gear_loadout` (exported through `select *`) is the slot to tier snapshot taken when the session synced; `null` means the session predates gear and `{}` means nothing was equipped.

## Key Files

| File        | Description                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------- |
| `index.ts`  | Handler; `exportFor` takes bucket `export_data_hour` then reads in `sql.begin('read only')` |
| `deno.json` | `{ "nodeModulesDir": "none" }`; picked up by `make check-functions`                         |
| `deno.lock` | Pinned dependency lock; regenerate with Deno, do not hand-edit                              |

## For AI Agents

### Working In This Directory

- Adding a user-owned table means adding it to the export and bumping the format version if the shape changes.
- Always scope queries by `user_id`.

### Testing Requirements

`tests/integration/account.test.ts` and `rate-limits.test.ts`. Stack required.

### Common Patterns

Handler is thin: OPTIONS, POST check, auth, parse, one async function, `errorResponse`. No comments in code.

## Dependencies

### Internal

- `../_shared/auth.ts`, `db.ts`, `http.ts`, `rate-limit.ts`

### External

- Deno 2, `npm:zod@4.6.5`, `npm:postgres@3.4.9`

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
