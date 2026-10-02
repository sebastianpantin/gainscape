# Catalog

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-01

## Purpose

The YAML files here are the single source of truth for all seed data: skills, exercises, programs, gear tiers and slots, pets and scrolls, and loot drop tables. `scripts/catalog/` loads them, validates them and renders `supabase/seed.sql`. Nobody edits the SQL by hand. Gear items, upgrade scrap materials and crafting recipes are not written out here; they are expanded from the tier and slot lists in `gear.yaml`.

## Key Files

| File                          | Description                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `skills.yaml`                 | List of eight skills. Fields: `key`, `name`, `sort_order` (int), `combat_weight` (number), optional `modality` (`lift` default, or `cardio`). Endurance and Agility are cardio with `combat_weight: 0`.                                                                                                                                                |
| `exercises.yaml`              | Built-in lifts and cardio activities. Fields: `key`, `name`, optional `modality` (`lift` default, or `cardio`), `load_type` (lifts only), `equipment`, `shares`, optional `variation_of`, `requires_unlock`, and for cardio a `cardio` block (`reference_pace_s_per_km?`, `pace_unit`, `max_effort`, `record_min_distance_m?`).                        |
| `programs.yaml`               | List of training programs. Each has `key`, `name` and `days`; each day has `key`, `name` and `exercises` of `{ exercise, sets, reps_min, reps_max }`.                                                                                                                                                                                                  |
| `gear.yaml`                   | One object with `tiers` (`key`, `name`, `rarity`, optional `upgrade_scraps`) and `slots` (`key`, `name`, `icon`). Drives gear items, scrap materials and upgrade recipes.                                                                                                                                                                              |
| `items.yaml`                  | List of non-gear items: pets and scrolls. Fields: `key`, `name`, `kind` (`pet` or `scroll`), `rarity`, `icon`, optional `description`, `grants`, `retired`.                                                                                                                                                                                            |
| `drop_tables.yaml`            | List of loot tables (`regular`, `rare`). Each has `key`, `name`, optional `retired`, and `entries` of `{ item, weight, min?, max? }`.                                                                                                                                                                                                                  |
| `program-templates/`          | One `<key>.yaml` per program template (`five_three_one.yaml`, `madcow_5x5.yaml`), seeded into `public.program_templates`. camelCase fields mirroring the domain `ProgramDefinition`: `key`, `version`, `name`, `source`, `lifts`, `inputs`, `referenceVars`, `initial`, `options`, optional `conversions` and `weekTables`, `schedule`, `progression`. |
| `program-templates.lock.json` | Maps each published `<key>@<version>` to the sha256 of its definition's canonical JSON (keys sorted recursively, no whitespace). `make catalog` and `make catalog-check` fail when a template drifts from its entry, is missing from the lock, or an entry has no template.                                                                            |

## For AI Agents

### Working In This Directory

- **Never edit `supabase/seed.sql`.** Change YAML, then run `make catalog` to regenerate it. `make catalog-check` (part of `make check` and CI) fails when the committed seed differs from what the YAML produces.
- **Schemas are strict.** `scripts/catalog/load.ts` parses every file with `z.strictObject`, so an unknown field fails the load. YAML keys are snake_case (`sort_order`, `load_type`, `reps_min`, `upgrade_scraps`); load.ts maps them to camelCase.
- **Exercise `shares` are basis points keyed by skill key and must sum to exactly 10000.** Every skill key must exist in `skills.yaml`.
- **Modality never crosses.** A lift shares only lift skills and a cardio activity only cardio skills; `variation_of` stays within one modality. A cardio activity has no `load_type` and needs a `cardio` block; `record_min_distance_m` needs a reference pace. Programs never use cardio.
- **Variations and unlocks.** `variation_of` must name another exercise. `requires_unlock: true` is only valid on a variation, such a locked exercise may not appear in a program, and it needs exactly one scroll in `items.yaml` whose `grants` names it.
- **Keys** match `^[a-z0-9_]+$`; names are 1 to 60 characters. Keys and lowercase names must be unique within each kind. Generated ids are UUID v5 values derived from names such as `item:<key>`, `drop_table:<key>` and `program:<key>`, so renaming a key creates a new row and retires the old one. Do not rename keys casually.
- **Gear is generated.** `gear.yaml` tiers and slots must match `ITEM_TIERS` and `GEAR_SLOTS` in `supabase/functions/_shared/domain/crafting.ts`, in the same order. Adding a tier or slot means changing that file in the same commit. A tier with `upgrade_scraps` also gets a `<tier>_scraps` material and an upgrade recipe per slot from the previous tier.
- **Items** need an `icon` from `ITEM_ICON_KINDS` (the gear slot keys plus `scraps`, `pet`, `scroll`). Only `grants` on scrolls is allowed.
- **Drop tables** must include non-retired `regular` and `rare` tables. Use `item: 'gear:<tier>'` as shorthand for every slot of that tier. `weight` is an integer from 1 to 1,000,000. `min` defaults to 1 and `max` defaults to `min`; both are 1 to 1000. Active tables may not reference retired items. Setting `retired: true` on an item or table keeps the row but stops it dropping.
- **Program templates** (`program-templates/*.yaml`) are parsed by the strict zod schema in `scripts/catalog/program-templates.ts`, then checked by the domain `validateProgramDefinition`. The rules:
  - Every template and every option needs a non-empty `source` list.
  - A `conversions` entry's `kg` must equal `lb × 0.45359` rounded to the nearest 1.25 kg (`kgFromLb`).
  - `key` matches `^[a-z0-9_]+$` and equals the file name; `name` is 1 to 60 characters.
  - A published `key@version` never changes: the seed inserts with `on conflict do nothing`, and the lock fails on drift. Publish a change as a new `version` and add its lock entry.
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
- Single-quoted strings where YAML needs it: `'gear:rookie'`, `'Scroll: pause squat'`.
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
