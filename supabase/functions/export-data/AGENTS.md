# export-data

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-11

## Purpose

POST endpoint returning a JSON export of everything the caller owns (account, profile, sessions, sets, XP, records, custom exercises and more) from one repeatable-read, read-only transaction, so all its queries see the same snapshot. Export format version is `EXPORT_FORMAT_VERSION = 7` (2 added `cardioRecords`, 3 added `bodyweightEntries` with `logged_on` as a `YYYY-MM-DD` date, `bodyweight_kg` and `updated_at`, 4 added `weeklyGoals` with `effective_from` as a `YYYY-MM-DD` Monday, `goal` (null when off) and `updated_at`, 5 added `userLoadout` with `slot`, `item_id` and `equipped_at` and the gear XP semantics below, 6 removed `userUnlocks` with the `user_unlocks` table and added the challenge semantics below, 7 added `programTemplates`: the `program_templates` rows the caller owns (`owner_user_id`), which are the published snapshots of their own programs that `programEnrollments` point at by `template_key` and `template_version`; catalog templates have no owner and are left out).

Gear XP semantics since version 5:

- `sets.xp_awarded` is the base XP, before any gear bonus.
- `set_skill_xp.xp` includes the gear bonus, so it can exceed the set's `xp_awarded`.
- `sessions.gear_loadout` (exported through `select *`) is the slot to tier snapshot taken when the session synced; `null` means the session predates gear and `{}` means nothing was equipped.

Challenge semantics since version 6:

- `sessions.challenge` (exported through `select *`) is the snapshot taken when the session synced: `challengeId`, `key`, `name`, the `definition` and the e1RM snapshot `e1rmKg`; `null` means no challenge was used.
- The verdict is not stored there. `sessions.summary.challenge` holds `passed` and the load floors, and `summary.challengeBonusBySkill` the bonus XP, which `set_skill_xp.xp` includes like the gear bonus.
- A scroll used for a challenge shows as an `item_ledger` row with reason `challenge` and delta -1.

## Key Files

| File        | Description                                                                                                                                                                                                                         |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`  | Handler; `exportFor` takes bucket `export_data_hour` then reads in `sql.begin('isolation level repeatable read read only')` and builds the document with `exportDocument`                                                           |
| `format.ts` | Pure: `EXPORT_FORMAT_VERSION`, `EXPORT_SECTIONS` (the top-level keys after `format`, `version`, `exportedAt` and `userId`, in order) and `exportDocument`, whose `ExportSections` type makes `index.ts` pass exactly those sections |
| `deno.json` | `{ "nodeModulesDir": "none" }`; picked up by `make check-functions`                                                                                                                                                                 |
| `deno.lock` | Pinned dependency lock; regenerate with Deno, do not hand-edit                                                                                                                                                                      |

## For AI Agents

### Working In This Directory

- Adding a user-owned table means adding it to the export (`tests/integration/export-coverage.test.ts` fails until every `public` table with a `user_id` or `owner_user_id` column maps to a section or has a reason in `NOT_EXPORTED_USER_TABLES`) and bumping the format version if the shape changes. A new top-level key goes in `EXPORT_SECTIONS`; `tests/deploy/export-format.test.ts` pins the key list per version, so add the new version's list there and bump `EXPORT_FORMAT_VERSION`.
- Always scope queries by `user_id`.

### Testing Requirements

`tests/deploy/export-format.test.ts` (no stack) pins the top-level keys to the format version. `tests/integration/account.test.ts`, `export-coverage.test.ts` and `rate-limits.test.ts` need the stack.

### Common Patterns

Handler is thin: OPTIONS, POST check, auth, parse, one async function, `errorResponse`. No comments in code.

## Dependencies

### Internal

- `../_shared/auth.ts`, `db.ts`, `http.ts`, `rate-limit.ts`

### External

- Deno 2, `npm:zod@4.6.5`, `npm:postgres@3.4.9`

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
