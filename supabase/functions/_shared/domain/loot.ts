import type { LootConfig } from './balance.ts';
import { roundTo } from './math.ts';
import { compareStrings } from './ordering.ts';
import {
  type Catalog,
  type RevokedDrop,
  type RevokeReason,
  type Rng,
  type RollKind,
  type SetKind,
  type SetResult,
  type SkillXp,
  setKind,
} from './types.ts';

const CHANCE_DECIMALS = 5;
const PET_CHANCE_DECIMALS = 10;
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

export interface PetEntry {
  itemId: string;
  itemKey: string;
  skillId: string;
}

export interface PetTable {
  id: string;
  key: string;
  entries: readonly PetEntry[];
}

export interface LootTables {
  regular: LootTable;
  rare: LootTable;
  pets: PetTable;
}

export interface LootCandidate {
  setId: string;
  position: number;
  kind: SetKind;
  effectiveReps: number;
  countedWorkS: number;
  interval: boolean;
  personalRecord: boolean;
  builtIn: boolean;
  skillXp: readonly SkillXp[];
}

export interface LootDayState {
  regularUsed: number;
  prUsed: number;
  petUsed: number;
  dryRolls: number;
  alreadyRolled: ReadonlySet<string>;
  ownedPetItemIds: ReadonlySet<string>;
}

interface LootDrop {
  itemId: string;
  itemKey: string;
  quantity: number;
}

interface LootRollResult {
  setId: string;
  kind: RollKind;
  tableId: string;
  rollIndex: number;
  chance: number;
  hit: boolean;
  drop: LootDrop | null;
}

interface LootPassResult {
  rolls: LootRollResult[];
  dryRolls: number;
}

type LootRngFor = (setId: string, kind: RollKind) => Rng;

export function lootRollKey(setId: string, kind: RollKind): string {
  return `${setId}:${kind}`;
}

export function lootCandidates(sets: readonly SetResult[], catalog: Catalog): LootCandidate[] {
  return [...sets]
    .sort((a, b) => a.set.position - b.set.position)
    .map((result) => ({
      setId: result.set.id,
      position: result.set.position,
      kind: setKind(result.set),
      effectiveReps: result.effectiveReps,
      countedWorkS: result.cardio?.countedWorkS ?? 0,
      interval: result.set.kind === 'cardio' && result.set.interval !== null,
      personalRecord:
        result.personalRecord !== null ||
        (result.cardio?.records.length ?? 0) > 0 ||
        (result.holdRecords?.length ?? 0) > 0,
      builtIn: catalog.exercises.get(result.set.exerciseId)?.builtIn ?? false,
      skillXp: result.skillXp,
    }));
}

function qualifiesForRegular(candidate: LootCandidate, cfg: LootConfig): boolean {
  if (candidate.kind !== 'cardio') return candidate.effectiveReps >= cfg.minEffectiveReps;
  const minWorkS = candidate.interval ? cfg.minIntervalCardioWorkS : cfg.minSteadyCardioWorkS;
  return candidate.countedWorkS >= minWorkS;
}

export function qualifies(kind: RollKind, candidate: LootCandidate, cfg: LootConfig): boolean {
  const regular = qualifiesForRegular(candidate, cfg);
  if (kind === 'regular') return regular;
  if (kind === 'pet') return regular && candidate.skillXp.some(({ xp }) => xp > 0);
  return regular && candidate.personalRecord && candidate.builtIn;
}

export function petChance(xp: number, cfg: LootConfig): number {
  return Math.min(GUARANTEED_CHANCE, roundTo(PET_CHANCE_DECIMALS, xp / cfg.petExpectedXp));
}

export function chance(dryRolls: number, cfg: LootConfig): number {
  return Math.min(cfg.maxChance, roundTo(CHANCE_DECIMALS, cfg.baseChance + dryRolls * cfg.badLuckStep));
}

interface WeightedEntry {
  itemKey: string;
  weight: number;
}

function pickWeighted<Entry extends WeightedEntry>(entries: readonly Entry[], u: number, tableKey: string): Entry {
  const sorted = [...entries].sort((a, b) => compareStrings(a.itemKey, b.itemKey));
  const total = sorted.reduce((sum, entry) => sum + entry.weight, 0);
  const target = Math.floor(u * total);
  let cumulative = 0;
  for (const entry of sorted) {
    cumulative += entry.weight;
    if (cumulative > target) return entry;
  }
  throw new RangeError(`loot table ${tableKey} has no entry for ${u}`);
}

export function pickEntry(table: LootTable, u: number): LootEntry {
  return pickWeighted(table.entries, u, table.key);
}

export function quantityFor(entry: LootEntry, u: number): number {
  return entry.minQuantity + Math.floor(u * (entry.maxQuantity - entry.minQuantity + 1));
}

const ROLL_KINDS: readonly RollKind[] = Object.freeze(['regular', 'pr', 'pet']);

interface EligibleRoll {
  candidate: LootCandidate;
  kind: RollKind;
}

export function eligibleRolls(
  candidates: readonly LootCandidate[],
  dayState: LootDayState,
  cfg: LootConfig,
): EligibleRoll[] {
  return [...candidates]
    .sort((a, b) => a.position - b.position)
    .flatMap((candidate) =>
      ROLL_KINDS.filter(
        (kind) => !dayState.alreadyRolled.has(lootRollKey(candidate.setId, kind)) && qualifies(kind, candidate, cfg),
      ).map((kind) => ({ candidate, kind })),
    );
}

function dropFrom(table: LootTable, rng: Rng): LootDrop {
  const entry = pickEntry(table, rng.next());
  return { itemId: entry.itemId, itemKey: entry.itemKey, quantity: quantityFor(entry, rng.next()) };
}

function missingPetsTrained(
  candidate: LootCandidate,
  pets: PetTable,
  owned: ReadonlySet<string>,
): (PetEntry & WeightedEntry)[] {
  const xpBySkill = new Map<string, number>();
  for (const { skillId, xp } of candidate.skillXp) xpBySkill.set(skillId, (xpBySkill.get(skillId) ?? 0) + xp);
  return pets.entries
    .filter((pet) => !owned.has(pet.itemId))
    .map((pet) => ({ ...pet, weight: xpBySkill.get(pet.skillId) ?? 0 }))
    .filter((pet) => pet.weight > 0);
}

export function rollSessionLoot(
  candidates: readonly LootCandidate[],
  tables: LootTables,
  dayState: LootDayState,
  cfg: LootConfig,
  rngFor: LootRngFor,
): LootPassResult {
  const rolls: LootRollResult[] = [];
  let { regularUsed, prUsed, petUsed, dryRolls } = dayState;
  const ownedPets = new Set(dayState.ownedPetItemIds);

  for (const { candidate, kind } of eligibleRolls(candidates, dayState, cfg)) {
    if (kind === 'regular' && regularUsed < cfg.regularRollsPerDay) {
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
    if (kind === 'pr' && prUsed < cfg.prRollsPerDay) {
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
    if (kind === 'pet') {
      const pets = missingPetsTrained(candidate, tables.pets, ownedPets);
      const rollChance = petChance(
        pets.reduce((sum, pet) => sum + pet.weight, 0),
        cfg,
      );
      if (rollChance === 0) continue;
      const rng = rngFor(candidate.setId, 'pet');
      const pet = rng.next() < rollChance ? pickWeighted(pets, rng.next(), tables.pets.key) : null;
      if (pet !== null) ownedPets.add(pet.itemId);
      rolls.push({
        setId: candidate.setId,
        kind: 'pet',
        tableId: tables.pets.id,
        rollIndex: petUsed,
        chance: rollChance,
        hit: pet !== null,
        drop: pet === null ? null : { itemId: pet.itemId, itemKey: pet.itemKey, quantity: 1 },
      });
      petUsed += 1;
    }
  }
  return { rolls, dryRolls };
}

export interface RollVersions {
  lootVersion: number;
  balanceVersion: number;
}

type ReplayedSessionRole = 'deleted' | 'edited' | 'edited_unchanged' | 'later';

export function revocationReason(
  source: RollKind,
  candidate: LootCandidate | undefined,
  session: ReplayedSessionRole,
  cfg: LootConfig,
  rolledUnder: RollVersions,
  current: RollVersions,
): RevokeReason | null {
  if (session === 'deleted') return 'session_deleted';
  if (candidate === undefined) return 'set_removed';
  const rolledUnderOlderRules =
    rolledUnder.lootVersion < current.lootVersion || rolledUnder.balanceVersion < current.balanceVersion;
  const keepsOlderRules = session === 'later' || session === 'edited_unchanged';
  if (keepsOlderRules && rolledUnderOlderRules) return null;
  if (!qualifies(source, candidate, cfg)) return 'no_longer_qualifies';
  return null;
}

export type SessionLootCandidate = LootCandidate & { sessionId: string };

export interface DropRevocationScope {
  editedSessionId: string;
  deletedSessionIds: readonly string[];
  unchangedSetIds: readonly string[];
}

interface HeldDrop {
  sessionId: string;
  setId: string;
  source: RollKind;
  lootVersion: number;
  balanceVersion: number | null;
}

export function replayedSessionRole(
  { sessionId, setId }: Pick<HeldDrop, 'sessionId' | 'setId'>,
  scope: DropRevocationScope,
): ReplayedSessionRole {
  if (scope.deletedSessionIds.includes(sessionId)) return 'deleted';
  if (sessionId !== scope.editedSessionId) return 'later';
  return scope.unchangedSetIds.includes(setId) ? 'edited_unchanged' : 'edited';
}

export function dropRevocations<Drop extends HeldDrop>(
  drops: readonly Drop[],
  current: readonly SessionLootCandidate[],
  scope: DropRevocationScope,
  cfg: LootConfig,
  balanceVersion: number,
): { drop: Drop; reason: RevokeReason }[] {
  const currentBySetId = new Map(current.map((candidate) => [`${candidate.sessionId}:${candidate.setId}`, candidate]));
  return drops.flatMap((drop) => {
    const reason = revocationReason(
      drop.source,
      currentBySetId.get(`${drop.sessionId}:${drop.setId}`),
      replayedSessionRole(drop, scope),
      cfg,
      { lootVersion: drop.lootVersion, balanceVersion: drop.balanceVersion ?? balanceVersion },
      { lootVersion: cfg.version, balanceVersion },
    );
    return reason === null ? [] : [{ drop, reason }];
  });
}

export function revokedInReplayOrder(
  drops: readonly (RevokedDrop & { sessionId: string })[],
  sets: readonly Pick<LootCandidate, 'setId' | 'position'>[],
  replayedSessionIds: readonly string[],
): RevokedDrop[] {
  const sessionRank = new Map(replayedSessionIds.map((id, index) => [id, index]));
  const positionOf = new Map(sets.map((set) => [set.setId, set.position]));
  const rank = (drop: RevokedDrop & { sessionId: string }) => sessionRank.get(drop.sessionId) ?? -1;
  const position = (drop: RevokedDrop) => positionOf.get(drop.setId) ?? Number.MAX_SAFE_INTEGER;
  const sourceOrder = (drop: RevokedDrop) => ROLL_KINDS.indexOf(drop.source);
  return [...drops]
    .sort((a, b) => rank(a) - rank(b) || position(a) - position(b) || sourceOrder(a) - sourceOrder(b))
    .map((drop) => ({
      dropId: drop.dropId,
      setId: drop.setId,
      itemId: drop.itemId,
      itemKey: drop.itemKey,
      quantity: drop.quantity,
      source: drop.source,
      revokedQuantity: drop.revokedQuantity,
    }));
}
