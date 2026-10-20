# export-data

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-20

## Purpose

POST endpoint returning a JSON export of everything the caller owns, read in one `repeatable read read only` transaction so every query sees the same snapshot. Rate limited by bucket `export_data_hour`.

## Map

- `index.ts`: the handler. `format.ts` (pure): `EXPORT_FORMAT_VERSION`, `EXPORT_SECTIONS` (the top-level keys, in order) and `exportDocument`, whose type makes `index.ts` pass exactly those sections. `deno.json`, `deno.lock` (never hand-edit).

## Rules and gotchas

- A new user-owned table must join the export. `tests/integration/export-coverage.test.ts` fails until every `public` table with a `user_id` or `owner_user_id` column or an FK to `profiles` maps to a section (or has a reason in `NOT_EXPORTED_USER_TABLES`), and every child table owned through one maps in `SECTION_OF_CHILD_TABLE` (or `NOT_EXPORTED_CHILD_TABLES`).
- A shape change bumps `EXPORT_FORMAT_VERSION`; a new top-level key goes in `EXPORT_SECTIONS`, and `tests/deploy/export-format.test.ts` pins the key list per version, so add the new version's list there.
- Always scope queries by `user_id`. `programTemplates` exports only templates the caller owns (published snapshots of their own programs); catalog templates have no owner.
- Semantics that readers of an export need (documented because the columns alone mislead):
  - `sets.xp_awarded` is base XP before any gear or challenge bonus; `set_skill_xp.xp` includes the bonuses, so it can exceed `xp_awarded`.
  - `sessions.gear_loadout` is the slot-to-tier snapshot at sync: `null` predates gear, `{}` means nothing equipped.
  - `sessions.challenge` is the snapshot at sync (id, key, name, definition, `e1rmKg`), `null` without a challenge. The verdict is in `sessions.summary.challenge` and the bonus in `summary.challengeBonusBySkill`.
  - `quests.completed[].xp` is the quest reward by skill key. It is part of `skills` (user totals) but of no `setSkillXp` row; the completion's `anchor_*` columns name the session after which replay adds it.
  - A scroll used for a challenge is an `item_ledger` row with reason `challenge` and delta -1.
  - `privateProfile.sex` (version 10) is `male`, `female` or `null` when not set; only the DOTS score uses it.
  - `bodyweightEntries.logged_on`, `weeklyGoals.effective_from` and `liftGoals.target_date` are `YYYY-MM-DD` dates (`effective_from` is a Monday; `goal` null means off; `target_date` null means no deadline). A lift goal stores no achievement: it is derived from `repMaxes`.

## Testing

`tests/deploy/export-format.test.ts` (no stack); `tests/integration/account.test.ts`, `export-coverage.test.ts`, `rate-limits.test.ts` (stack).

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
