# tests (pgTAP)

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-01

## Purpose

pgTAP suites for the database layer: grants, RLS policies, rate limiting, friendships, feed visibility, account deletion and the auth-confirm trigger. They run inside the local Postgres via `make test-db`.

## Key Files

| File                                | Description                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `00_helpers.test.sql`               | Creates the pgTAP extension and the `tests` schema with helpers: `create_user`, `authenticate_as`, `add_session`, `add_event`, `make_friends`, `give_everything`. Revokes the schema from `public`, `anon` and `authenticated`                                                                                                           |
| `01_privileges.test.sql`            | Table and function grants                                                                                                                                                                                                                                                                                                                |
| `02_self_only_tables.test.sql`      | Users see only their own rows                                                                                                                                                                                                                                                                                                            |
| `03_rate_limits.test.sql`           | `private.take_rate_limit` buckets                                                                                                                                                                                                                                                                                                        |
| `04_friendships.test.sql`           | Friend request lifecycle and visibility                                                                                                                                                                                                                                                                                                  |
| `05_profile_collection.test.sql`    | Profile and collection access                                                                                                                                                                                                                                                                                                            |
| `06_feed_gz_hiscores.test.sql`      | Feed, gz and hiscores                                                                                                                                                                                                                                                                                                                    |
| `07_account_deletion.test.sql`      | Cascades on user delete                                                                                                                                                                                                                                                                                                                  |
| `08_auth_confirm.test.sql`          | Password rotation on confirm, username change window                                                                                                                                                                                                                                                                                     |
| `09_cardio_schema.test.sql`         | Cardio set checks (lift xor cardio, bounds, effort kind), cross-modality shares, locked modality, lift-only effort mode                                                                                                                                                                                                                  |
| `10_write_rate_limits.test.sql`     | The client write buckets: limits, 429 over the limit, per-user budgets, server writes never limited                                                                                                                                                                                                                                      |
| `11_program_enrollments.test.sql`   | Program templates read-only, enrollments and events owner-only, one active enrollment, indexes, unit, template and kind checks, append-only events, RPC grants, enroll and adjust limits, cascades                                                                                                                                       |
| `12_program_session_links.test.sql` | Session links and set snapshots from 023: column types, the owner-only composite FK and its `set null (enrollment_id)`, the position check, partial indexes, complete-or-absent snapshots and their bounds (minimum reps 0 to 100), one ref per session, `enrollment_facts` grants and owner-only reads, enrollment and account deletion |
| `13_bodyweight_entries.test.sql`    | Bodyweight entries from 026: one per user and day, select-only grants and the owner read policy, a bodyweight save logs today in the owner's time zone and replaces the same day, other profile changes and a cleared bodyweight log nothing, bounds, no friend or stranger reads, account deletion                                      |

## For AI Agents

### Working In This Directory

- Files run in filename order and `00_helpers` must stay first. New files take the next `NN_` prefix.
- Suites `01`-`09` are `begin; select plan(N); ... select * from finish(); rollback;`. `00_helpers.test.sql` is different: it creates the helper schema and functions outside a transaction, then runs its own `plan(6)`. Update `plan(N)` when adding assertions.
- Use `tests.create_user` then `tests.authenticate_as(id)` to act as a user; do not insert into `auth.users` by hand.
- Tests create and delete users. `make test-db` runs `scripts/assert-local-db.mjs` first and passes `--local`. Never run against a hosted project.
- No skipped or placeholder tests.

### Testing Requirements

This directory is the test layer. Add the failing assertion to the file matching the area (or a new numbered file), run `make test-db`, then add the migration. The local stack must be running.

### Common Patterns

- `has_function` checks at the end of the helpers file guard the helper signatures.
- Role switching with `set_config('role', 'authenticated', true)` via `tests.authenticate_as`.

## Dependencies

### Internal

- `../migrations/`, `../seed.sql`, `scripts/assert-local-db.mjs`

### External

- pgTAP, Supabase CLI `test db`

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
