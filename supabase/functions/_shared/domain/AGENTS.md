# Domain

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-14

## Purpose

The pure, deterministic game engine. It turns logged sets into effective reps, XP split across skills, levels, strength estimates, personal records, loot drops, challenge verdicts, program prescriptions and friend-feed events. The same files run in Deno inside the Edge Functions (through `../domain/index.ts`) and in the browser and Vitest (through the `@domain/*` alias). The server uses it as the authority when a session completes, is edited, or has its caches rebuilt; the web app uses it for offline previews and display rules.

## Map

- `index.ts`: the barrel production code imports. It re-exports the core modules and, for the program modules, units and load rounding, only the names used by `web/src`, `supabase/functions`, `scripts` or `e2e`. Fold internals (`advanceProgram`, `initialProgramState`, `orderFacts`, `ruleKeyOf`) stay unexported; tests import them from their module.
- Session pipeline: `pipeline.ts` (the `Step` list and `processSession`), with steps in `strength.ts` (`trackStrength`), `fatigue.ts` (`checkFatigue`), `records.ts` (`detectPersonalRecords`). Supporting rules: `xp.ts`, `effort.ts`, `cardio.ts`, `levels.ts`, `combat.ts`, `math.ts`.
- Server flow helpers: `new-session.ts` (scored vs `history_only`), `replay.ts`, `ordering.ts`, `edit-window.ts`, `edit-diff.ts`, `session-timing.ts`, `exercise-lookup.ts`, `errors.ts`.
- Items: `loot.ts`, `rng.ts`, `crafting.ts`, `gear.ts`, `challenges.ts`, `collection.ts`. Quests: `quests.ts`. Feed: `events.ts`.
- Programs (`program-*.ts`): `program-types.ts` (template and enrollment types), `program-eval.ts` (option, number and amount evaluation, slot and set lookups), `program-validate.ts` (`parseProgramDefinition`, `validateProgramDefinition`, `validateEnrollment`), `program-schedule.ts` (positions), `program-prescription.ts` (a day's sets), `program-progression.ts` (`advanceProgram`, rule handlers), `program-stages.ts` (stage machine and 5RM retests), `program-state.ts` (facts and state), `program-fold.ts` (`programStateAt`), plus `rpe-chart.ts`, `prescription-snapshot.ts`, `units.ts`, `load-rounding.ts`.
- Tuning surface: `balance.ts` (`DEFAULT_BALANCE`, `DEFAULT_LOOT`, `DEFAULT_FEED`, `BALANCE_VERSION`, `LOOT_VERSION`).
- Shared types and payload limits: `types.ts` (`MAX_SETS_PER_SESSION`, `MAX_SET_LOAD_KG`, `MAX_SET_REPS`, `HOLD_BOUNDS`; enforced by `../session-payload.ts` and shared with the web set editors).

## Rules and gotchas

Purity and structure:

- A domain file imports only siblings as `./name.ts`, never touches `Deno`, `process`, `window`, `document`, `localStorage` or `require`, and never reads the clock, calls `Math.random` or does I/O. Time is a parameter (`isWithinEditWindow(startedAt, now)`), randomness an `Rng` (`LootRngFor`). `tests/domain/purity.test.ts` and ESLint enforce imports and globals; nothing enforces the clock and `Math.random` rule, so reviewers must. Deno, crypto or database work goes in `../loot-seeds.ts` or `../stores/`.
- `purity.test.ts` also fails on a runtime import cycle anywhere here and on any import cycle (type imports included) among `program-*.ts`. Keep the program modules a DAG: `program-fold.ts` sits on top of `program-progression.ts` and `program-state.ts`; `program-state.ts` imports no program module that imports it back. `strength.ts` and `records.ts` import only the `Step` type from `pipeline.ts`, which imports their steps back; keep that import type-only or it becomes a runtime cycle.
- Add a name to `index.ts` only when a production caller needs it. Changing a type or export can break the web type-check (`web/src/lib/**/*-rules.ts`, `web/src/offline/`); run `make typecheck`.
- Web rules import the domain too: after a behaviour change here also run `make test-web`.
- Config is an explicit parameter (`cfg: BalanceConfig`); no module reads `DEFAULT_*` except as a parameter default. Pipeline steps return new context objects, never mutate.
- Iteration order must be explicit for anything persisted: sets by `position`, skills by `sortOrder`, sessions by `compareSessionKeys` (`startedAt`, then id), loot entries by `itemKey`. Never rely on Map or object key order.
- Rounding: `roundTo` for decimals (loads 2, chances 5, intensity bonus 6), `roundXp` for whole XP. XP is always integer; `splitXp` is a largest-remainder split in basis points summing to 10,000.

Pipeline:

- Step order matters: `resolveSets`, `trackStrength`, `checkFatigue`, `detectPersonalRecords`, `awardXp`, `awardSessionBonuses`, `applyXp`, `detectLevelUps`. History-only sessions run only `resolveSets` (no XP, records or loot).
- `awardSessionBonuses` computes gear and challenge bonuses on base XP and adds them (total base × (1 + challenge% + gear%), never compounded), spreads them by largest remainder (ties to the lower set position), and reports only the part that fits under `maxXp` (challenge first). A failed challenge pays nothing but still reports its verdict.
- `SetResult.xp` (stored `sets.xp_awarded`) is base XP; `set_skill_xp` parts include the gear bonus. Sum `set_skill_xp` or `summary.xpBySkill` for skill totals.
- Holds: rep equivalents `floor(durationS / holdSecondsPerRep)` or `floor(distanceM / carryMetresPerRep)` through `effectiveReps`, no cold start, no intensity bonus; an external hold at 0 kg earns 0. Holds skip strength, fatigue, lift records and challenges. A hold takes a level effort only (`RangeError` for RIR or RPE).
- Counted cardio minutes per session are capped in two pools: bouts of an exercise with a Mobility share (`mobilityMaxCountedMinutesPerSession`) and all others (`cardioMaxCountedMinutesPerSession`).
- Cold start: an unrated set with no estimate earns `coldStartXpPerSet` for up to `coldStartMaxSetsPerExercise` sets per exercise. A set with no prior e1RM is gated by its own capped candidate, so the first set of a new lift earns the same intensity bonus as an identical later one. A flagged logged RIR builds strength at its trust floor, never at the rejected claim. External sets with no load earn no XP.
- `checkFatigue` only raises an earlier set's RIR within one session; sets that lift no load neither judge nor add fatigue. `effortProximity` is also used by the web recovery map, which is otherwise separate.
- Rep-max slots are kept monotone: a set raising a higher-rep slot silently raises a lighter lower-rep slot, keeping that slot's `exactSetId` and adding no record. The first session of an exercise (and of a hold) is a baseline. Hold records reuse `RecordState.cardio` and are summarised as `kind: 'cardio'`; an external hold counts only at `holdRecordMinExternalLoadKg` or more.
- `implausibleTiming`: `session_too_old` exists because Postgres rejects year 0 with a 500; `MAX_SESSION_DURATION_MS` (12 h) also caps the web finish time.

Loot determinism (changing any of these silently changes existing players' drops):

- Production RNG: HMAC-SHA256 of `lootSeedMessage(userId, setId, kind)` keyed by `LOOT_SECRET` (`../loot-seeds.ts`) fed to `sfc32FromSeed` (16 seed bytes, 12 discarded outputs). Do not change `lootSeedMessage`, the sfc32 constants, the order of `rng.next()` calls in `rollSessionLoot`, `pickEntry`'s key-sorted order or `quantityFor`.
- The same set always rolls the same result, so replays and edits never re-roll; recorded rolls are skipped through `LootDayState.alreadyRolled` and `lootRollKey`. `eligibleRolls` (regular before pr, position order) is exactly what the store seeds.
- Revocation: `revocationReason` never revokes an `edited_unchanged` or `later` drop rolled under an older `LOOT_VERSION` or in a session completed under an older `BALANCE_VERSION`, so a rule change keeps existing drops (`rebuild-caches` never revokes). Drops on changed sets of the edited session are judged under current rules; removed sets and deleted sessions always revoke. `unchangedSetIds` uses the same test as the web `dropsAtRisk`, so that warning stays exact.

Balance and versioning:

- Bump `BALANCE_VERSION` whenever a change alters stored derived values (XP, RIR, e1RM, effective reps, records, bonuses). After a bump `replayFrom` in `../stores/replay.ts` rebuilds a stale user's derived state before its next write (answering `503 rebuild_required` only when that rebuild fails); run `make rebuild-caches` to refresh everyone else (`ALL=1` replays every profile). Bump `LOOT_VERSION` when loot semantics change.
- Changing `GEAR_SLOT_SKILLS`, `ITEM_TIERS` order, `gearBonusPercentAtFullTier`, `challengeBonusPercent`, `CHALLENGE_LOAD_STEP_KG` or what `judgeChallenge` counts changes replayed XP: bump `BALANCE_VERSION` and run `make rebuild-caches ALL=1`. Both percents must stay non-negative integers (`RangeError` otherwise).
- `effortLevelRir` (easy 5, hard 3, near_failure 1, failure 0) is stored in `sets.effort_value`; changing it needs a data migration.
- A challenge is judged only from its `sessions.challenge` snapshot (definition and e1RM taken at sync) and the replayed sets, never the live catalog. A set never meets a load percent without an e1RM in the snapshot; kg volume counts `weightKg × reps`, so bodyweight adds nothing. The judge floor rounds `'down'`; `'up'` exists only on `roundLoad` for the web challenge prefill and is not a `RoundingMode`. An edit can flip the verdict; replaying a later session never changes an earlier one.
- Feed event keys (`pr:<exerciseId>` for lifts, `pr:<setId>` for each cardio bout, level keys) are persisted identity: `syncSessionEvents` deletes events whose key is no longer produced and `reactions` cascade, so changing a key format drops friends' existing reactions on replay.
- Quests (`quests.ts`): quest XP is a time-anchored grant (`SkillXpGrant`), applied by `replayHistory` after every session at or before its anchor and capped like session XP; empty grants must give output identical to no grants, so quests never need a `BALANCE_VERSION` bump. Quest progress is advanced once per scored session at sync (`questsAfterSession`, called only by `complete-session`); edits, deletes and rebuilds never touch it. A session counts only if it ended strictly after the quest started, advances at most one step and discards the surplus. `questStatus` and `questStartProblems` are the single start rule for `start-quest` and the web quest board. Stored definitions key `rewardXp` and required levels by skill id; `summary.quests.levelUps` and the quest feed event's `levelUps` key by skill key. The quest event key `quest:<questKey>` is persisted identity, and its level ups ride in its payload so they never collide with session `level:` keys.
- `xpPerEffectiveRep` is the main pacing lever: tune it first, then `make sim-check`.
- `make sim-check` asserts the design bands in `scripts/balance/bands.ts` (for example 2 to 3 years to legs 99 for a balanced lifter); run it after any `balance.ts` change.

Rules restated elsewhere (change both sides together):

- `boutDurationSeconds` is shared by `../session-payload.ts` and `web/src/lib/workout/cardio-rules.ts`; changing it changes stored and displayed bout durations.

- `isPositionInSchedule` = SQL `private.is_valid_program_position` (including the 520-week horizon, `MAX_PROGRAM_WEEKS`); `validateEnrollment` = `private.is_valid_enrollment`, and `MAX_REFERENCE_VALUE` (1000 kg, 2205 lb) = `private.max_program_reference`. SQL also requires bindings to be a UUID or null.
- `CARDIO_BOUNDS`, `countedWorkSeconds`, `intervalDurationSeconds` = migration check `cardio_duration_within_bounds`; `HOLD_BOUNDS` = the hold checks of migration 044.
- `strengthStateAt` = SQL `exercise_strength_state`. `replayHistory` gets the same state from `strength-tracker.ts`, a forward fold that admits rows once and keeps a monotonic window-max per exercise, because rescanning history per session made replay quadratic (about 6 s for 2,000 sessions). Its window eviction is only correct for a forward walk, so `stateAt` throws a `RangeError` on a session before the last one it answered, and `record` on rows out of session order. `tests/domain/strength-tracker.test.ts` proves both agree; `strengthStateAt` stays the reference and the simulator's entry point.
- `storableSnapshot` is the single snapshot rule for the server and the web cache.
- `crafting.ts` tiers and slots are checked against the catalog by `scripts/catalog/`.
- `advanceProgram` ignores facts at invalid positions and references to an undeclared var or a lift without inputs.
- A barbell lift (the default unless the template sets `barbell: false`) never gets a prescribed load below the bar.

## Testing

- `tests/domain/` with `make test-domain` (no stack); one file with `npx vitest run tests/domain/xp.test.ts`. Tests are named after the module; non-obvious homes: `levels.test.ts` covers `combat.ts`, `xp.test.ts` covers `effort.ts`, `records.test.ts` covers `collection.ts`, `replay.test.ts` covers `ordering.ts`, `pipeline.test.ts` covers `exercise-lookup.ts`, `quests.test.ts` and `replay.test.ts` cover quest grants, `loot-seeds.test.ts` covers `../loot-seeds.ts`, program modules use `program-*.test.ts` with `tests/domain/program-fixtures/`.
- Builders: `tests/domain/fixtures.ts` (catalog, sessions), `tests/domain/loot-fixtures.ts`. fast-check is available.
- `balance.ts`: `make sim-check` (`tests/balance/balance-bands.test.ts`, about 1 s).
- Gap: `effortInputFromStored` has a direct test only for cardio; add a domain test before changing it.
- Database-crossing behaviour (replay persistence, caches) is in `tests/integration/replay.test.ts` and `rebuild-caches.test.ts` (`make test-integration`, stack needed).

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
