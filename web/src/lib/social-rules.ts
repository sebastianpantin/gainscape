import { combatLevel, levelForXp, totalLevel } from '@domain/index.ts';
import { CARDIO_RECORD_KINDS, type CardioRecordKind } from '@domain/types.ts';
import { formatCardioRecord } from './cardio-rules.ts';
import { collectionPercent } from './collection-rules.ts';
import type { LoadType, PaceUnit } from './catalog-rules.ts';
import { formatLoad } from './format.ts';
import { capitalized } from './names.ts';
import type { BadgeColor, UnitPref } from './profile-rules.ts';
import { RATE_LIMITED_CODE } from './rate-limit.ts';
import { distanceUnitFor, formatWeight } from './units.ts';

export type FeedEventType = 'pr' | 'level_up' | 'level_99' | 'drop';

export interface FeedItem {
  eventId: string;
  userId: string;
  username: string;
  displayName: string;
  badgeColor: BadgeColor;
  type: FeedEventType;
  occurredAt: string;
  payload: Record<string, unknown>;
  gzCount: number;
  gzGiven: boolean;
  isOwn: boolean;
}

export interface FeedCursor {
  beforeAt: string;
  beforeId: string;
}

export interface FeedText {
  headline: string;
  detail?: string;
}

export type FriendRelation = 'incoming' | 'friend' | 'outgoing';

export interface FriendRow {
  userId: string;
  username: string;
  displayName: string;
  badgeColor: BadgeColor;
  relation: FriendRelation;
  since: string;
}

export interface HiscoreRow {
  userId: string;
  username: string;
  displayName: string;
  badgeColor: BadgeColor;
  isSelf: boolean;
  skillXp: Record<string, number>;
  collectionFilled: number;
  collectionTotal: number;
}

export interface HiscoreSkill {
  key: string;
  combatWeight: number;
}

export type HiscoreMetric = 'total' | 'combat' | 'collection' | `skill:${string}`;

export function skillMetric(skillKey: string): HiscoreMetric {
  return `skill:${skillKey}`;
}

function metricSkillKey(metric: HiscoreMetric): string | null {
  return metric.startsWith('skill:') ? metric.slice('skill:'.length) : null;
}

export interface RankedHiscore {
  row: HiscoreRow;
  value: number;
}

export type SendRequestStatus =
  'sent' | 'accepted' | 'already_pending' | 'already_friends' | 'not_found' | 'self' | 'limit_reached';

const SOCIAL_ERRORS: Record<string, string> = {
  user_not_found: 'No one with that username.',
  cannot_friend_self: "That's you.",
  friend_limit_reached: 'Friend limit reached.',
  request_not_found: 'That request is gone.',
  event_not_found: 'That post is no longer visible.',
  [RATE_LIMITED_CODE]: 'Slow down a little and try again.',
};

const GENERIC_SOCIAL_ERROR = 'Something went wrong. Try again.';

export function socialErrorMessage(error: { message?: string } | null | undefined): string {
  return SOCIAL_ERRORS[error?.message ?? ''] ?? GENERIC_SOCIAL_ERROR;
}

export function sendRequestText(status: SendRequestStatus, username: string): string {
  switch (status) {
    case 'sent':
    case 'already_pending':
      return `Request sent to ${username}`;
    case 'accepted':
      return `You and ${username} are now friends`;
    case 'already_friends':
      return `You and ${username} are already friends`;
    case 'not_found':
      return SOCIAL_ERRORS.user_not_found;
    case 'self':
      return SOCIAL_ERRORS.cannot_friend_self;
    case 'limit_reached':
      return SOCIAL_ERRORS.friend_limit_reached;
  }
}

function numberOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

const UNKNOWN_EXERCISE = 'exercise';

const CARDIO_PAYLOAD_VALUES: Record<CardioRecordKind, string> = {
  distance: 'distanceM',
  pace: 'paceSPerKm',
  duration: 'countedWorkS',
};
const DISTANCE_KINDS: readonly CardioRecordKind[] = ['distance', 'pace'];

function cardioPrText(item: FeedItem, name: string, unit: UnitPref): FeedText {
  const { payload } = item;
  const paceUnit: PaceUnit = payload.paceUnit === 'per_100m' ? 'per_100m' : 'per_km';
  const distanceUnit = distanceUnitFor(unit, paceUnit);
  const kinds = textOf(payload.recordKinds)
    .split(',')
    .filter((kind): kind is CardioRecordKind => CARDIO_RECORD_KINDS.some((known) => known === kind));
  const parts = kinds.flatMap((kind) => {
    const value = numberOf(payload[CARDIO_PAYLOAD_VALUES[kind]]);
    return value === null ? [] : [formatCardioRecord(kind, value, distanceUnit)];
  });
  const headline = parts.length === 0 ? `New ${name} record` : `New ${name} record: ${parts.join(' · ')}`;
  const distanceHidden = payload.weightsHidden === true && kinds.some((kind) => DISTANCE_KINDS.includes(kind));
  return distanceHidden ? { headline, detail: `Distance hidden by ${item.username}` } : { headline };
}

function prText(item: FeedItem, unit: UnitPref): FeedText {
  const { payload } = item;
  const name = textOf(payload.exerciseName) || UNKNOWN_EXERCISE;
  if (payload.kind === 'cardio') return cardioPrText(item, name, unit);
  const reps = numberOf(payload.reps);
  if (payload.kind === 'bodyweight_reps') {
    return { headline: reps === null ? `New ${name} record` : `New ${name} record: ${reps} reps` };
  }
  const title = reps === null ? `New ${name} record` : `New ${reps}RM ${name}`;
  const loadKg = numberOf(payload.loadKg);
  if (payload.weightsHidden === true || loadKg === null) {
    return { headline: title, detail: `Weights hidden by ${item.username}` };
  }
  const loadType = (textOf(payload.loadType) || 'external') as LoadType;
  const load = formatLoad(loadKg, loadType, unit);
  const totalLoadKg = numberOf(payload.totalLoadKg);
  if (loadType === 'bodyweight_plus' && totalLoadKg !== null) {
    return { headline: `${title}: ${load} (${formatWeight(totalLoadKg, unit)} total)` };
  }
  return { headline: `${title}: ${load}` };
}

export function feedText(item: FeedItem, unit: UnitPref): FeedText {
  const { payload } = item;
  switch (item.type) {
    case 'pr':
      return prText(item, unit);
    case 'level_up':
    case 'level_99':
      return { headline: levelHeadline(item.type, numberOf(payload.to), textOf(payload.skillName)) };
    case 'drop': {
      const rarity = textOf(payload.rarity);
      const headline = textOf(payload.itemName) ? `Found ${textOf(payload.itemName)}` : 'Found an item';
      return rarity ? { headline, detail: `${capitalized(rarity)} drop` } : { headline };
    }
  }
}

function levelHeadline(type: 'level_up' | 'level_99', to: number | null, skillName: string): string {
  const mark = type === 'level_99' ? '!' : '';
  if (to === null) return `Levelled up ${skillName || 'a skill'}${mark}`;
  return skillName ? `Reached level ${to} ${skillName}${mark}` : `Reached level ${to}${mark}`;
}

const RARITY_BADGES: Record<string, string> = { common: 'COM', uncommon: 'UNC', rare: 'RARE', legendary: 'LEG' };
const LEVEL_99_BADGE = '99';
const LEVEL_BADGE = 'LVL';

export function feedBadge(item: FeedItem): string {
  if (item.type === 'pr') return 'PR';
  if (item.type === 'drop') return RARITY_BADGES[textOf(item.payload.rarity)] ?? 'DROP';
  if (item.type === 'level_99') return LEVEL_99_BADGE;
  const to = numberOf(item.payload.to);
  return to === null ? LEVEL_BADGE : String(to);
}

export function feedCursor(lastItem: FeedItem): FeedCursor {
  return { beforeAt: lastItem.occurredAt, beforeId: lastItem.eventId };
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function relativeTime(occurredAt: string, now: number = Date.now()): string {
  const elapsed = Math.max(0, now - Date.parse(occurredAt));
  if (elapsed < MINUTE_MS) return 'just now';
  if (elapsed < HOUR_MS) return `${Math.floor(elapsed / MINUTE_MS)} min`;
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)} h`;
  if (elapsed < 2 * DAY_MS) return 'yesterday';
  return `${Math.floor(elapsed / DAY_MS)} days`;
}

function levelsOf(row: HiscoreRow, skills: readonly HiscoreSkill[]): number[] {
  return skills.map((skill) => levelForXp(row.skillXp[skill.key] ?? 0));
}

function totalXp(row: HiscoreRow, skills: readonly HiscoreSkill[]): number {
  return skills.reduce((sum, skill) => sum + (row.skillXp[skill.key] ?? 0), 0);
}

function hiscoreValue(row: HiscoreRow, skills: readonly HiscoreSkill[], metric: HiscoreMetric): number {
  if (metric === 'total') return totalLevel(levelsOf(row, skills));
  if (metric === 'combat') {
    const levels = levelsOf(row, skills);
    return combatLevel(skills.map((skill, index) => ({ level: levels[index], weight: skill.combatWeight })));
  }
  if (metric === 'collection') return collectionPercent(row.collectionFilled, row.collectionTotal);
  return levelForXp(row.skillXp[metricSkillKey(metric) ?? ''] ?? 0);
}

function combatSkills(skills: readonly HiscoreSkill[]): HiscoreSkill[] {
  return skills.filter((skill) => skill.combatWeight > 0);
}

function tiebreakXp(row: HiscoreRow, skills: readonly HiscoreSkill[], metric: HiscoreMetric): number {
  if (metric === 'total') return totalXp(row, skills);
  if (metric === 'combat') return totalXp(row, combatSkills(skills));
  if (metric === 'collection') return row.collectionFilled;
  return row.skillXp[metricSkillKey(metric) ?? ''] ?? 0;
}

export function rankHiscores(
  rows: readonly HiscoreRow[],
  skills: readonly HiscoreSkill[],
  metric: HiscoreMetric,
): RankedHiscore[] {
  return rows
    .map((row) => ({ row, value: hiscoreValue(row, skills, metric), xp: tiebreakXp(row, skills, metric) }))
    .sort(
      (a, b) =>
        b.value - a.value ||
        b.xp - a.xp ||
        (a.row.username < b.row.username ? -1 : a.row.username > b.row.username ? 1 : 0),
    )
    .map(({ row, value }) => ({ row, value }));
}
