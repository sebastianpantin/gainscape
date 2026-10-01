import type { LootConfig } from './balance.ts';
import { roundTo } from './strength.ts';
import type { Catalog, RevokeReason, Rng, RollKind, SetResult } from './types.ts';

const CHANCE_DECIMALS = 5;
const GUARANTEED_CHANCE = 1;

export interface LootEntry {
  itemId: string;
  itemKey: string;
  weight: number;
  minQuantity: number;
  maxQuantity: number;
}

export interface LootTable {
  id: string;
  key: string;
  entries: readonly LootEntry[];
}

export interface LootTables {
  regular: LootTable;
  rare: LootTable;
}

export interface LootCandidate {
  setId: string;
  position: number;
  effectiveReps: number;
  personalRecord: boolean;
  builtIn: boolean;
}

export interface LootDayState {
  regularUsed: number;
  prUsed: number;
  dryRolls: number;
  alreadyRolled: ReadonlySet<string>;
}

export interface LootDrop {
  itemId: string;
  itemKey: string;
  quantity: number;
}

export interface LootRollResult {
  setId: string;
  kind: RollKind;
  tableId: string;
  rollIndex: number;
  chance: number;
  hit: boolean;
  drop: LootDrop | null;
}

export interface LootPassResult {
  rolls: LootRollResult[];
  dryRolls: number;
}

export type LootRngFor = (setId: string, kind: RollKind) => Rng;

export function lootRollKey(setId: string, kind: RollKind): string {
  return `${setId}:${kind}`;
}

export function lootCandidates(sets: readonly SetResult[], catalog: Catalog): LootCandidate[] {
  return [...sets]
    .sort((a, b) => a.set.position - b.set.position)
    .map((result) => ({
      setId: result.set.id,
      position: result.set.position,
      effectiveReps: result.effectiveReps,
      personalRecord: result.personalRecord !== null,
      builtIn: catalog.exercises.get(result.set.exerciseId)?.builtIn ?? false,
    }));
}

export function qualifies(kind: RollKind, candidate: LootCandidate, cfg: LootConfig): boolean {
  const regular = candidate.effectiveReps >= cfg.minEffectiveReps;
  if (kind === 'regular') return regular;
  return regular && candidate.personalRecord && candidate.builtIn;
}

export function chance(dryRolls: number, cfg: LootConfig): number {
  return Math.min(cfg.maxChance, roundTo(CHANCE_DECIMALS, cfg.baseChance + dryRolls * cfg.badLuckStep));
}

export function pickEntry(table: LootTable, u: number): LootEntry {
  const entries = [...table.entries].sort((a, b) => (a.itemKey < b.itemKey ? -1 : a.itemKey > b.itemKey ? 1 : 0));
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  const target = Math.floor(u * total);
  let cumulative = 0;
  for (const entry of entries) {
    cumulative += entry.weight;
    if (cumulative > target) return entry;
  }
  throw new RangeError(`loot table ${table.key} has no entry for ${u}`);
}

export function quantityFor(entry: LootEntry, u: number): number {
  return entry.minQuantity + Math.floor(u * (entry.maxQuantity - entry.minQuantity + 1));
}

function dropFrom(table: LootTable, rng: Rng): LootDrop {
  const entry = pickEntry(table, rng.next());
  return { itemId: entry.itemId, itemKey: entry.itemKey, quantity: quantityFor(entry, rng.next()) };
}

export function rollSessionLoot(
  candidates: readonly LootCandidate[],
  tables: LootTables,
  dayState: LootDayState,
  cfg: LootConfig,
  rngFor: LootRngFor,
): LootPassResult {
  const rolls: LootRollResult[] = [];
  let { regularUsed, prUsed, dryRolls } = dayState;
  const ordered = [...candidates].sort((a, b) => a.position - b.position);

  for (const candidate of ordered) {
    if (
      !dayState.alreadyRolled.has(lootRollKey(candidate.setId, 'regular')) &&
      qualifies('regular', candidate, cfg) &&
      regularUsed < cfg.regularRollsPerDay
    ) {
      const rng = rngFor(candidate.setId, 'regular');
      const rollChance = chance(dryRolls, cfg);
      const hit = rng.next() < rollChance;
      const drop = hit ? dropFrom(tables.regular, rng) : null;
      dryRolls = hit ? 0 : dryRolls + 1;
      rolls.push({
        setId: candidate.setId,
        kind: 'regular',
        tableId: tables.regular.id,
        rollIndex: regularUsed,
        chance: rollChance,
        hit,
        drop,
      });
      regularUsed += 1;
    }
    if (
      !dayState.alreadyRolled.has(lootRollKey(candidate.setId, 'pr')) &&
      qualifies('pr', candidate, cfg) &&
      prUsed < cfg.prRollsPerDay
    ) {
      const rng = rngFor(candidate.setId, 'pr');
      rolls.push({
        setId: candidate.setId,
        kind: 'pr',
        tableId: tables.rare.id,
        rollIndex: prUsed,
        chance: GUARANTEED_CHANCE,
        hit: true,
        drop: dropFrom(tables.rare, rng),
      });
      prUsed += 1;
    }
  }
  return { rolls, dryRolls };
}

export function revocationReason(
  source: RollKind,
  candidate: LootCandidate | undefined,
  sessionDeleted: boolean,
  cfg: LootConfig,
): RevokeReason | null {
  if (sessionDeleted) return 'session_deleted';
  if (candidate === undefined) return 'set_removed';
  if (!qualifies(source, candidate, cfg)) return 'no_longer_qualifies';
  return null;
}
