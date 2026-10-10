# Catalog

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-08

## Purpose

The YAML files here are the single source of truth for all seed data: skills, exercises, programs, gear tiers and slots, scroll challenges, pets and scrolls, and loot drop tables. `scripts/catalog/` loads them, validates them and renders `supabase/seed.sql`. Nobody edits the SQL by hand. Gear items, upgrade scrap materials and crafting recipes are not written out here; they are expanded from the tier and slot lists in `gear.yaml`.

## Key Files

| File                          | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skills.yaml`                 | List of nine skills. Fields: `key`, `name`, `sort_order` (int), `combat_weight` (number), optional `modality` (`lift` default, or `cardio`). Grip (sort 7) is a lift skill with `combat_weight: 1`, trained by wrist curls, carries and a 500 to 2000 basis-point share of deadlifts, rows, pull-ups, shrugs and hanging raises. Endurance and Agility are cardio with `combat_weight: 0`.                                                                                                                                                                                                    |
| `exercises.yaml`              | Built-in lifts and cardio activities. Fields: `key`, `name`, optional `modality` (`lift` default, or `cardio`), `load_type` (lifts only), `equipment`, `shares`, optional `variation_of`, and for cardio a `cardio` block (`reference_pace_s_per_km?`, `pace_unit`, `max_effort`, `record_min_distance_m?`).                                                                                                                                                                                                                                                                                  |
| `programs.yaml`               | List of training programs. Each has `key`, `name` and `days`; each day has `key`, `name` and `exercises` of `{ exercise, sets, reps_min, reps_max }`.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `gear.yaml`                   | One object with `tiers` (`key`, `name`, `rarity`, optional `upgrade_scraps`) and `slots` (`key`, `name`, `icon`). Drives gear items, scrap materials and upgrade recipes.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `challenges.yaml`             | List of scroll challenges. Fields: `key`, `name`, `kind` (`prescription` or `volume`). A prescription has `supersets` of `{ rounds, exercises: [{ exercise, reps, pct? }] }`; a volume has `volume: { metric (reps or kg), target, exercise?, min_pct? }`. `pct` and `min_pct` are whole percents of e1RM (1 to 100).                                                                                                                                                                                                                                                                         |
| `items.yaml`                  | List of non-gear items: pets and scrolls. Fields: `key`, `name`, `kind` (`pet` or `scroll`), `rarity`, `icon`, optional `description`, `grants` (a challenge key, scrolls only), `retired`.                                                                                                                                                                                                                                                                                                                                                                                                   |
| `drop_tables.yaml`            | List of loot tables (`regular`, `rare`). Each has `key`, `name`, optional `retired`, and `entries` of `{ item, weight, min?, max? }`.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `program-templates/`          | One `<key>.yaml` per program template (`five_three_one`, `gzclp`, `juggernaut_2`, `madcow_5x5`, `nsuns_5day`, `rpe_top_set`, `smolov_jr`, `starting_strength`, `stronglifts_5x5`, `texas_method`), its latest, deep-equal to its fixture in `tests/domain/program-fixtures/`; older ones stay frozen as `<key>@<ver>.yaml`. All seed `public.program_templates`. camelCase fields mirroring the domain `ProgramDefinition`: `key`, `version`, `name`, `source`, `lifts`, `inputs`, `referenceVars`, `initial`, `options`, optional `conversions` and `weekTables`, `schedule`, `progression`. |
| `program-templates.lock.json` | Maps each published `<key>@<version>` to the sha256 of its definition's canonical JSON (keys sorted recursively, no whitespace). `make catalog` and `make catalog-check` fail when a template drifts from its entry, is missing from the lock, or an entry has no template.                                                                                                                                                                                                                                                                                                                   |

## For AI Agents

### Working In This Directory

- **Never edit `supabase/seed.sql`.** Change YAML, then run `make catalog` to regenerate it. `make catalog-check` (part of `make check` and CI) fails when the committed seed differs from what the YAML produces.
- **Schemas are strict.** `scripts/catalog/load.ts` parses every file with `z.strictObject`, so an unknown field fails the load. YAML keys are snake_case (`sort_order`, `load_type`, `reps_min`, `upgrade_scraps`); load.ts maps them to camelCase.
- **Exercise `shares` are basis points keyed by skill key and must sum to exactly 10000.** Every skill key must exist in `skills.yaml`.
- **Modality never crosses.** A lift shares only lift skills and a cardio activity only cardio skills; `variation_of` stays within one modality. A cardio activity has no `load_type` and needs a `cardio` block; `record_min_distance_m` needs a reference pace. Programs never use cardio.
- **Variations.** `variation_of` must name another exercise. Exercises have no unlock gate; every built-in exercise is visible to everyone.
- **Challenges.** `kind: prescription` needs `supersets` and no `volume`; `kind: volume` needs `volume` and no `supersets`. A superset has at least 2 exercises, a challenge names each exercise at most once across its supersets, and rounds, reps and `target` are at least 1. Challenge exercises must be lifts, and `pct` or `min_pct` only on an external-load exercise. `min_pct` needs `exercise`. Every challenge has exactly one scroll in `items.yaml` whose `grants` names it. A challenge row is retired when it leaves the YAML.
- **Keys** match `^[a-z0-9_]+$`; names are 1 to 60 characters. Keys and lowercase names must be unique within each kind. Generated ids are UUID v5 values derived from names such as `item:<key>`, `drop_table:<key>` and `program:<key>`, so renaming a key creates a new row and retires the old one. Do not rename keys casually.
- **Gear is generated.** `gear.yaml` tiers and slots must match `ITEM_TIERS` and `GEAR_SLOTS` in `supabase/functions/_shared/domain/crafting.ts`, in the same order. Adding a tier or slot means changing that file in the same commit. A tier with `upgrade_scraps` also gets a `<tier>_scraps` material and an upgrade recipe per slot from the previous tier.
- **Items** need an `icon` from `ITEM_ICON_KINDS` (the gear slot keys plus `scraps`, `pet`, `scroll`). Only `grants` on scrolls is allowed.
- **Drop tables** must include non-retired `regular` and `rare` tables. Use `item: 'gear:<tier>'` as shorthand for every slot of that tier; its `weight` is the whole tier's weight, split evenly across the slots (the generator multiplies every other entry's weight by the slot count and gives each slot the shorthand's weight, so `gear:rookie` weight 5 drops one of the six rookie pieces as often as a weight-5 item). `weight` is an integer from 1 to 1,000,000. `min` defaults to 1 and `max` defaults to `min`; both are 1 to 1000. Active tables may not reference retired items. Setting `retired: true` on an item or table keeps the row but stops it dropping.
- **Scroll odds stay fixed.** Every scroll in `rare` has the same weight, and all scrolls together make up exactly 36/98 of the table's weight, the odds of the first twelve scrolls (`tests/catalog/generate.test.ts`). Adding scrolls at weight 3 therefore comes in steps of 12: with `12 × k` scrolls, multiply every other `rare` weight by `k`.
- **Program templates** (`program-templates/*.yaml`) are parsed by the strict zod schema in `scripts/catalog/program-templates.ts`, then checked by the domain `validateProgramDefinition`. The rules:
  - Every template and every option needs a non-empty `source` list.
  - A `conversions` entry's `kg` must equal `lb × 0.45359` rounded to the nearest 1.25 kg (`kgFromLb`).
  - `key` matches `^[a-z0-9_]+$` and equals the file name (`<key>.yaml`, or `<key>@<version>.yaml` with its version for an older one, which must be older than `<key>.yaml`); `name` is 1 to 60 characters.
  - Every lift has a `name` for people, never its raw key.
  - A lift not loaded on a barbell (the GZCLP dumbbell row and lat pulldown) sets `barbell: false`, so its prescribed load floors at one rounding increment instead of the enrollment's bar weight.
  - Every day is named `Day 1`, `Day 2`, ... in schedule order, never after a weekday, lift or workout letter, because any day of the week works. Day `key`s (`mon`, `a`, `squat`) stay as they are.
  - gitleaks' `generic-api-key` rule reads the `stronglifts_5x5` key as a secret. `.gitleaks.toml` allows that exact value only in `catalog/program-templates/*.yaml` and `supabase/seed.sql`; a new key that trips a rule gets the same narrow allowlist entry.
  - A published `key@version` never changes: the seed inserts with `on conflict do nothing`, and the lock fails on drift. Publish a change as a new `version`: copy the published `<key>.yaml` unchanged to `<key>@<version>.yaml` (its lock entry stays), bump `version` in `<key>.yaml` and its domain fixture, change it, add its lock entry and run `make catalog`. Enrollments stay on the version they started (the foreign key); the app offers new enrollments the highest version per key. The domain must keep reading every older version, so a new definition field is optional and its absence keeps the old behaviour.
- **IP denylist.** No key, name or description may contain a term from `tests/ip-denylist.txt` (whole-word, case-insensitive).
- **Catalog changes can affect other code.** `scripts/balance/catalog.ts` hard-codes exercise shares, skills and the cardio profiles of `running`, `sprint_intervals` and `jump_rope` for the simulator; `tests/catalog/sim-catalog.test.ts` fails if they drift from the YAML.

### Testing Requirements

- Validation rules: `tests/catalog/validate.test.ts`. Seed rendering and ids: `tests/catalog/generate.test.ts`. Program templates, their lock and seed rows: `tests/catalog/program-templates.test.ts` and `tests/catalog/program-template-types.test.ts`. Run them all with `make test-catalog`. Add the failing test there first, either a new invalid-catalog case or a new expected statement.
- A new or changed rule belongs in `scripts/catalog/validate.ts` (see `scripts/catalog/AGENTS.md`), not in the YAML.
- After any YAML edit run `make catalog`, then `make catalog-check`. Row-level behaviour against the seeded database is covered by `tests/integration/catalog.test.ts`, which needs `make start` and `make reset`.
- Also run `make test-domain` and `make sim-check` if you change shares or gear, since `tests/domain/crafting.test.ts` loads the catalog. The balance suite uses its own hard-coded `SIM_CATALOG` in `scripts/balance/catalog.ts`; keep shares in sync there, and `tests/catalog/sim-catalog.test.ts` (no stack needed) catches drift.
- No local stack is needed for `make test-catalog`, `make catalog` or `make catalog-check`.

### Common Patterns

- Flow style for short records: `shares: { chest: 7000, shoulders: 2000, arms: 1000 }`, `- { item: grinder_scraps, weight: 30, min: 2, max: 5 }`.
- Single-quoted strings where YAML needs it: `'gear:rookie'`, `'Scroll: Squat Century'`.
- Names reuse the key's words (`barbell_bench_press` is "Barbell Bench Press").

## Dependencies

### Internal

- `scripts/catalog/` (loader, validator, SQL renderer, generator)
- `supabase/functions/_shared/domain/crafting.ts` (`ITEM_TIERS`, `GEAR_SLOTS`, `ITEM_ICON_KINDS`)
- `supabase/seed.sql` (generated output)
- `tests/ip-denylist.txt`

### External

- `yaml` and `zod` (used by the loader)

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
