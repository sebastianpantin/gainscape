# migrations

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-01

## Purpose

The ordered, append-only history of the Postgres schema: tables, RLS policies, grants, triggers and SQL functions. `supabase db reset` applies them in filename order, then loads `../seed.sql`.

## Key Files

| File                                             | Description                                                                                                                                                                                   |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260928000001_001_walking_skeleton.sql`        | Core tables: profiles, sessions, sets, skills, exercises, XP and RLS                                                                                                                          |
| `20260928000002_002_strength.sql`                | Nullable `rir`, e1RM and rep-capacity candidate columns, `derived_balance_version`, `exercise_maxes`                                                                                          |
| `20260928000003_003_records.sql`                 | `rep_maxes`, `bodyweight_rep_records`, `pinned_exercises`                                                                                                                                     |
| `20260930000004_004_custom_exercises.sql`        | RPCs `save_custom_exercise`, `set_custom_exercise_archived`, `reorder_pins`                                                                                                                   |
| `20260930000005_005_programs.sql`                | Training programs and days                                                                                                                                                                    |
| `20260930000006_006_session_edits.sql`           | `sessions.revision` and the `deleted_sessions` tombstone table                                                                                                                                |
| `20260930000007_007_profile.sql`                 | Profile fields, checks, `set_timezone`                                                                                                                                                        |
| `20260930000008_008_item_catalog.sql`            | Items, drop tables and entries, recipes, `user_unlocks`, `exercises.requires_unlock`                                                                                                          |
| `20260930000009_009_loot.sql`                    | Append-only `loot_rolls`, `drops`, `drop_luck`, `user_items`, `item_ledger`                                                                                                                   |
| `20260930000010_010_crafting.sql`                | `crafts` and the `craft` RPC                                                                                                                                                                  |
| `20260930000011_011_events_rate_limits.sql`      | `private.rate_limit_rules`/`rate_limit_hits`, `take_rate_limit`, `events`                                                                                                                     |
| `20260930000012_012_friends.sql`                 | `friendships`, anonymous rate limits, client IP config, friend RPCs (largest file)                                                                                                            |
| `20260930000013_013_feed.sql`                    | `reactions`, `visible_user_ids`, `feed_payload`, `get_feed`                                                                                                                                   |
| `20261001000014_014_auth_confirm.sql`            | `private.rotate_password_on_confirm` trigger and `public.change_username` (pre-hijack fix)                                                                                                    |
| `20261001000015_015_easy_effort_rir.sql`         | Rewrites stored `easy` level efforts from RIR 6 to RIR 5                                                                                                                                      |
| `20261001000016_016_exercise_strength_state.sql` | `public.exercise_strength_state(as_of, window_days)`: the caller's per-exercise window max, fallback max and prior-session presence, matching `strengthStateAt`; feeds the workout XP preview |

## For AI Agents

### Working In This Directory

- Filename format is `YYYYMMDDHHMMSS_NNN_name.sql`. The timestamp prefix orders migrations, and `NNN` is a three-digit sequence. A new file takes the next number (015) and a timestamp later than the last.
- Never edit or reorder a merged migration. Fix forward with a new file.
- Every new table needs RLS enabled, explicit grants, and coverage in `../tests/` (privileges and self-only tests).
- Server-only helpers belong in the `private` schema.
- After changes: `make reset`, then update the hand-written row types and column lists in `web/src/lib/` and the SQL in `functions/_shared/stores/`.
- Rate-limit buckets named in `functions/_shared/rate-limit.ts` need a row in `private.rate_limit_rules` (seeded in migration 011 and later). `private.take_rate_limit` raises `unknown_rate_limit_bucket` for a missing row.

### Testing Requirements

Write the failing pgTAP test first in the matching file under `../tests/` (or a new numbered file) and run `make test-db`. Behaviour reached through Edge Functions or the REST API goes in `tests/integration/` (for example `rls.test.ts`, `social.test.ts`, `rate-limits.test.ts`). The local stack is required for both.

### Common Patterns

- `create or replace function ... set search_path = ''` with fully qualified names.
- `security definer` functions for cross-user reads, with explicit `revoke` and `grant`.

## Dependencies

### Internal

- `../seed.sql`, `../tests/`, `../functions/_shared/stores/`, `web/src/lib/` row types

### External

- PostgreSQL 17, pgTAP, `uuid-ossp`/`extensions` schema

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
