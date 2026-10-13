# migrations

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

The ordered, append-only history of the Postgres schema: tables, RLS policies, grants, triggers and SQL functions. `supabase db reset` (`make reset`) applies them in filename order, then loads `../seed.sql`. Each file's name says what it adds; read the file for details.

## Map

- File names are `YYYYMMDDHHMMSS_NNN_name.sql`. The timestamp orders them; `NNN` is a three-digit sequence. List the directory to see the history.
- To find the current definition of a function, grep for `function public.<name>(` (or `private.`) and take the highest-numbered file. Many functions were redefined several times (for example `save_program` in 005, 010, 018, 031, 039, 047; `craft` in 010, 030, 031, 037; `publish_program`, `enroll_program`, `delete_program` last in 049).
- Server-only helpers live in the `private` schema (`private.limit_client_write`, `private.cap_pins`, `private.account_active`, `private.can_view_user`, `private.is_valid_enrollment`, `private.is_valid_program_position`, `private.resetting_account`).
- Rate limit rules live in `private.rate_limit_rules` (011 and later); client write limits run through `private.limit_client_write` triggers (020).

## Rules and gotchas

Numbering and editing:

- A new file takes the next `NNN` and a timestamp later than the last file. Never edit or reorder a merged migration; fix forward with a new file.
- Numbers 039 to 041 belong to the `custom-programs` branch; the Grip and Mobility work started at 042 in parallel, so 042 is not newer work than 040.
- A new enum value cannot be used in the transaction that adds it, so add it in its own migration (017 adds `cardio` to `effort_input_type` alone).
- plpgsql bodies are not dependency-tracked: replace every function that uses a table or column before dropping it (031 replaces `save_program`, `collection_counts`, `get_collection` and `craft()` before dropping `user_unlocks`).
- `create or replace` of a function must restate its grants and keep the rest of the body identical unless the change is intended; several migrations say "otherwise identical to NNN" for this reason.

Security patterns:

- Every new table: RLS enabled, explicit grants, and pgTAP coverage in `../tests/` (privileges and self-only tests).
- Functions use `set search_path = ''` with fully qualified names. `security definer` only for cross-user reads or writes the client may not do directly, with explicit `revoke` and `grant` (usually `authenticated` only). Private helpers get no client execute grant.
- Clients cannot write game tables (sessions, sets, XP, records, loot); only the Edge Functions write them (`tests/integration/rls.test.ts` holds this).
- An RPC that acts on the caller takes no user id; it scopes every statement to `auth.uid()` (`reset_account_data`).
- `loot_rolls` and `item_ledger` are append-only: `private.forbid_append_only_changes` refuses update and delete, `private.forbid_append_only_truncate` refuses truncate (009, 010). The only bypass is the account reset marker: `private.resetting_account(subject)` is true only when a `private.account_resets` row for the current `pg_current_xact_id()` names that user, so a client cannot forge it even with raw SQL as `authenticated` (050). `private.limit_client_write` skips limits under the same marker.
- Since 051 every foreign key between two user-owned tables is a composite on `(id, user_id)` (with `unique (id, user_id)` on the parent), so a child cannot point at another user's row and a delete cannot cascade into another user's data. New user-owned child tables must follow this. The one cross-user link is `reactions.event_id`. Record links use `on delete set null (<column>)` so only the link clears.
- 051 kept the original constraint names on purpose: `web/src/lib/progress/exercise-progress-rules.ts` embeds `sets!rep_maxes_set_id_fkey`. Renaming an FK breaks PostgREST embeds.
- Display names: check `profiles_display_name_visible` (036) refuses control, bidi control and blank-only names; `private.create_profile_for_new_user` falls back to the username.
- `private.rotate_password_on_confirm` (014) is the pre-hijack fix: confirming an email through its link replaces the password set at signup with a random one, so a squatter who signed up with someone else's email cannot sign in after the owner confirms.
- `craft` and `equip_gear` require `private.account_active(caller)`, so banned or unconfirmed accounts cannot use them; friend counts also count only active counterparts.
- `private.limit_client_write` counts only when `auth.uid()` is set, each row once per client statement (tracked in one transaction-local setting), and a pin reorder once per statement.
- Rate limit buckets named in `functions/_shared/rate-limit.ts` need a row in `private.rate_limit_rules`; `private.take_rate_limit` raises `unknown_rate_limit_bucket` for a missing row.

Concurrency:

- `private.cap_pins` (50 pins) takes a `for no key update` lock on the owner's profile row before counting (034), so two concurrent pins at 49 cannot both pass. `no key update` keeps foreign-key `key share` locks unblocked. Copy this pattern for other per-user caps.

SQL that restates domain or web rules (change both sides together, with a new migration for the SQL side):

- `private.is_valid_enrollment` and `private.is_valid_program_position` restate `validateEnrollment` and `isPositionInSchedule` (`functions/_shared/domain/program-definition.ts`, `program-schedule.ts`). The position check also gates the session link in `complete-session`. SQL additionally requires bindings to be a UUID or null, which `validateEnrollment` does not check. Parity is tested in `tests/integration/program-validation-parity.test.ts` and `program-enrollments.test.ts`.
- `private.max_program_reference(unit)` (1000 kg, 2205 lb) equals the domain `MAX_REFERENCE_VALUE`.
- `profiles_display_name_visible` restates `nameProblem` in `web/src/lib/names.ts`.
- `cardio_duration_within_bounds` restates `countedWorkSeconds`, `intervalDurationSeconds` and `CARDIO_BOUNDS` (`domain/cardio.ts`).
- `set_is_lift_cardio_or_hold` and the hold branches (044) restate `HOLD_BOUNDS` in `domain/types.ts`.
- `save_exercise_note` trims an explicit, locale-independent whitespace set (ECMAScript whitespace and line terminators including U+FEFF, plus U+0085), the same set as `trimNote` in `web/src/lib/exercises/exercise-note-rules.ts`; never use `\s` (038).
- `exercise_strength_state` (016) matches the domain `strengthStateAt`.
- `private.compiled_program_definition` (040) compiles a user program into a domain rotation definition; its output must parse with `parseProgramDefinition` and match the web `customTemplateKey` / `customLiftKey` (`tests/integration/program-follow-parity.test.ts`).
- Stored level efforts hold the RIR of `effortLevelRir` in `domain/balance.ts`; changing that mapping needs a data migration of `sets.effort_value` (015 did this for `easy`).

Data and seed coupling:

- `program_templates` rows come from the seed and are never overwritten; a template change is a new `(key, version)` row. Custom templates have `owner_user_id` set and a `custom_` key (check `only_custom_templates_have_an_owner`).
- `scrolls_grant_a_challenge` (032) was created `not valid` because the seed fills `grants_challenge_id`; on a hosted project the catalog seed must run right after 032.
- `skills.sort_order` is a non-deferrable unique column, so reordering moves rows in two steps (042: +100, then −99).
- Never change a built-in exercise's `measure` once sets exist: `set_matches_exercise_measure` (046) would make its old sets uneditable, and `lock_measure_once_logged` (048) refuses the change (also turning `tracks_distance` off once a set has a distance), so such a catalog edit fails the seed instead of breaking replay. Check constraints still report first.
- Holds and mobility: an exercise with a `mobility` share has no other share (045); `save_program` refuses any exercise whose `measure` is not `reps` (047) and any progression on a non-`external` exercise (039).
- `reset_account_data` tombstones every deleted session in `deleted_sessions` so a stale device resubmitting one gets `410 session_deleted`. A new user-owned table must be added to its delete list or to the kept list in `tests/integration/reset-account.test.ts`.
- `sessions.completed_at` defaults to a value truncated to milliseconds (023), matching JavaScript `Date` precision; resubmits answer the stored `completedAt` byte for byte.

After a change:

- `make reset`, then update the hand-written `*Row` types and `*_COLUMNS` in `web/src/lib/` and the SQL in `functions/_shared/stores/`.
- A new user-owned table also needs an export mapping (`tests/integration/export-coverage.test.ts`) and a reset decision (`reset-account.test.ts`).

## Testing

- Write the failing pgTAP test first in the matching `../tests/NN_<area>.test.sql` (or a new numbered file) and run `make test-db`.
- Behaviour reached through Edge Functions or the REST API goes in `tests/integration/` (`rls.test.ts`, `social.test.ts`, `rate-limits.test.ts`, ...) with `make test-integration`.
- Both need the local stack.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
