# tests (pgTAP)

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

pgTAP suites for the database layer: grants, RLS policies, rate limits, friendships and feed visibility, account deletion and reset, the auth-confirm trigger, and the table checks and RPCs added by each migration. They run inside the local Postgres via `make test-db`.

## Map

- `00_helpers.test.sql`: the pgTAP extension and the `tests` schema of helpers (`create_user`, `authenticate_as`, `add_session`, `add_event`, `make_friends`, `give_everything`, ...). Its `has_function` checks guard the helper signatures.
- `NN_<area>.test.sql`: one file per area or per migration feature; the file name says which. Later files usually name the migration number they cover.

## Rules and gotchas

- Files run in filename order and `00_helpers` must stay first. A new file takes the next `NN_` prefix.
- Each suite is `begin; select plan(N); ... select * from finish(); rollback;`. Update `plan(N)` when adding assertions. `00_helpers` is the exception: it creates the helper schema outside a transaction, then runs its own plan, and revokes the `tests` schema from `public`, `anon` and `authenticated`.
- Act as a user with `tests.create_user` then `tests.authenticate_as(id)` (it switches role with `set_config('role', 'authenticated', true)`). Never insert into `auth.users` by hand.
- Tests create and delete users. `make test-db` runs `scripts/assert-local-db.mjs` first and passes `--local`. Never run against a hosted project.
- Invariants pinned here that are easy to break from a migration:
  - Every foreign key between two tables with a `user_id` also matches `user_id` (except `reactions_event_id_fkey`), so no row can point at another user's row (`31_owner_matched_foreign_keys`).
  - `reset_account_data` is security definer with an empty `search_path`, executable by `authenticated` only; a hand-set `gainscape.resetting_account` setting must not unlock `loot_rolls` or `item_ledger` deletes (`30_reset_account_data`).
  - Server writes are never rate limited; client write buckets are per user (`10_write_rate_limits`).
  - Exercise note trimming uses the same whitespace set as the web app (U+FEFF and U+0085 trimmed, zero width space kept) (`14_exercise_notes`).
  - A logged exercise cannot change `measure` or turn `tracks_distance` off, but rewriting the same values (as the seed does) must pass (`28_exercise_measure_lock`).
  - A kept snapshot of a deleted program raises `unknown_template` on enroll (`29_program_template_cleanup`).
- No skipped or placeholder tests.

## Testing

This directory is the test layer. Add the failing assertion to the matching file (or a new numbered file), run `make test-db` with the local stack running, then write the migration.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
