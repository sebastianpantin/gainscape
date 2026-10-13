# Catalog

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

The YAML files here are the single source of truth for all seed data: skills, exercises, programs, gear tiers and slots, scroll challenges, pets and scrolls, loot drop tables and program templates. `scripts/catalog/` loads, validates and renders them into `supabase/seed.sql`. Gear items, upgrade scrap materials and crafting recipes are not written out; they are expanded from the tier and slot lists in `gear.yaml`.

## Map

- One file per kind: `skills.yaml`, `exercises.yaml`, `programs.yaml`, `gear.yaml`, `challenges.yaml`, `items.yaml` (pets and scrolls), `drop_tables.yaml`. The field list is the strict zod schema in `scripts/catalog/load.ts`.
- `program-templates/<key>.yaml`: the latest version of each template, deep-equal to its fixture in `tests/domain/program-fixtures/`; older versions stay frozen as `<key>@<version>.yaml`. camelCase fields mirroring the domain `ProgramDefinition`.
- `program-templates.lock.json`: sha256 of each published `<key>@<version>`'s canonical JSON (keys sorted recursively, no whitespace).

## Rules and gotchas

- Never edit `supabase/seed.sql`. Change YAML, run `make catalog`. `make catalog-check` (in `make check` and CI) fails on drift.
- Schemas are strict (`z.strictObject`): an unknown field fails the load. YAML keys are snake_case except in program templates.
- Keys match `^[a-z0-9_]+$`; names are 1 to 60 characters; keys and lowercase names are unique per kind. Ids are UUID v5 from names such as `item:<key>`, so renaming a key creates a new row and retires the old one. Do not rename keys casually.
- Exercise `shares` are basis points keyed by skill key and sum to exactly 10000. An activity that trains `mobility` trains it alone (10000), because the 60-minute Mobility cap picks its pool by that share. Mobility is the one skill no gear slot boosts (`SKILLS_WITHOUT_GEAR`).
- Modality never crosses: a lift shares only lift skills, a cardio activity only cardio skills, and `variation_of` stays within one modality. Cardio needs a `cardio` block and no `load_type`; `record_min_distance_m` needs a reference pace; `distance: false` hides the field and refuses a logged distance. Programs never use cardio. A `measure` (hold or carry) is only on lifts, a variation keeps its base's measure, and programs and challenges never use a hold.
- Logged exercises keep their kind. The database refuses changing `load_type`, `modality`, `measure`, or turning distance tracking off after a logged distance (migrations 001, 018, 048). The validator cannot see user data, so such an edit passes `make catalog` but fails the seed during `make deploy`. Add a new exercise key instead.
- Exercises have no unlock gate; every built-in exercise is visible to everyone.
- Challenges: `prescription` needs `supersets` and no `volume`; `volume` the reverse. A superset has at least 2 exercises; a challenge names each exercise once; rounds, reps and `target` are at least 1. Exercises are lifts; `pct`/`min_pct` (whole percents of e1RM, 1-100) only on external-load exercises; `min_pct` needs `exercise`. Every challenge has exactly one scroll whose `grants` names it. A challenge removed from the YAML is retired.
- Gear: `gear.yaml` tiers and slots must match `ITEM_TIERS` and `GEAR_SLOTS` in `supabase/functions/_shared/domain/crafting.ts`, in the same order; change both in one commit. A tier with `upgrade_scraps` also gets a `<tier>_scraps` material and an upgrade recipe per slot from the previous tier.
- Items need an `icon` from `ITEM_ICON_KINDS`. Only scrolls have `grants`.
- Drop tables: non-retired `regular` and `rare` tables must exist. `item: 'gear:<tier>'` is shorthand for every slot of that tier, and its `weight` is the whole tier's weight (the generator multiplies every other entry by the slot count). `weight` is 1 to 1,000,000; `min` defaults to 1, `max` to `min`, both 1 to 1000. Active tables may not reference retired items. `retired: true` keeps the row but stops it dropping.
- Scroll odds stay fixed: every scroll in `rare` has the same weight and all scrolls together make up exactly 36/98 of the table (`tests/catalog/generate.test.ts`). Scrolls at weight 3 therefore come in steps of 12: with `12 × k` scrolls, multiply every other `rare` weight by `k`.
- Program templates are parsed by the strict schema in `scripts/catalog/program-templates.ts`, then checked by the domain `validateProgramDefinition`:
  - Every template and option needs a non-empty `source` list.
  - A key must not start with `custom_`, reserved for user snapshots written by `publish_program`. The key equals the file name; an `@<version>` file must be older than `<key>.yaml`.
  - A `conversions` entry's `kg` equals `lb × 0.45359` rounded to the nearest 1.25 kg (`kgFromLb`).
  - Every lift has a human `name`. A lift not on a barbell sets `barbell: false`, so its load floors at one rounding increment instead of the bar weight.
  - Days are named `Day 1`, `Day 2`, ... in schedule order, never after a weekday or lift, because any day of the week works. Day `key`s stay as they are.
  - A published `key@version` never changes: the seed inserts with `on conflict do nothing` and the lock fails on drift. To change one, copy `<key>.yaml` unchanged to `<key>@<version>.yaml`, bump `version` in `<key>.yaml` and its domain fixture, edit, add the lock entry, run `make catalog`. Enrollments stay on their version (foreign key); new enrollments get the highest version. The domain must keep reading every older version, so a new definition field is optional and its absence keeps the old behaviour.
  - gitleaks reads the `stronglifts_5x5` key as a secret. `.gitleaks.toml` allows that exact value only in `catalog/program-templates/*.yaml` and `supabase/seed.sql`; a new key that trips a rule gets the same narrow allowlist entry.
- No key, name or description may contain a term from `tests/ip-denylist.txt` (whole word, case-insensitive).
- `scripts/balance/catalog.ts` hard-codes shares, skills and some cardio profiles for the simulator; `tests/catalog/sim-catalog.test.ts` fails when they drift.

## Testing

- `make test-catalog` (no stack): `validate.test.ts` for rules, `generate.test.ts` for seed rendering and ids, `program-templates.test.ts` and `program-template-types.test.ts` for templates and the lock. Add the failing case there first; new rules go in `scripts/catalog/validate.ts`.
- After a YAML edit: `make catalog`, `make catalog-check`. Changed shares or gear: also `make test-domain` and `make sim-check`.
- Seeded rows against the database: `tests/integration/catalog.test.ts` (stack, after `make reset`).

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
