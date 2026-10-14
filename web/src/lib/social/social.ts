import type { LoadType } from '../exercises/catalog-rules.ts';
import type { BadgeColor, TrainingFocus } from '../profile/profile-rules.ts';
import {
  type FeedCursor,
  type FeedItem,
  type FriendRow,
  type HiscoreRow,
  type SendRequestStatus,
  socialErrorMessage,
} from './social-rules.ts';
import { supabase } from '../platform/supabase.ts';

export const FEED_PAGE_SIZE = 20;

export interface FriendCard {
  userId: string;
  username: string;
  displayName: string;
  badgeColor: BadgeColor;
}

export interface SendRequestResult {
  status: SendRequestStatus;
  friend?: FriendCard;
}

export interface ProfileView {
  userId: string;
  username: string;
  displayName: string;
  bio: string | null;
  trainingFocus: TrainingFocus | null;
  trainingSince: number | null;
  badgeColor: BadgeColor;
  joinedAt: string;
  showWeights: boolean;
  relation: 'self' | 'friend';
  friendsSince: string | null;
  skillXp: Record<string, number>;
  collection: { filledSlots: number; totalSlots: number };
  questPoints: number;
}

export interface CollectionViewExercise {
  exerciseId: string;
  name: string;
  loadType: LoadType;
  builtIn: boolean;
  pinned: boolean;
  repMaxes: { reps: number; loadKg: number | null; exact: boolean }[];
  maxReps: number | null;
}

export interface CollectionView {
  userId: string;
  weightsHidden: boolean;
  completion: { filledSlots: number; totalSlots: number };
  exercises: CollectionViewExercise[];
  items: { found: { itemId: string; quantity: number; firstObtainedAt: string }[]; catalogCount: number };
}

async function call<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(socialErrorMessage(error));
  return data as T;
}

interface FriendRecord {
  user_id: string;
  username: string;
  display_name: string;
  badge_color: BadgeColor;
  relation: FriendRow['relation'];
  since: string;
}

interface FeedRecord {
  event_id: string;
  user_id: string;
  username: string;
  display_name: string;
  badge_color: BadgeColor;
  type: FeedItem['type'];
  occurred_at: string;
  payload: Record<string, unknown> | null;
  gz_count: number;
  gz_given: boolean;
  is_own: boolean;
}

interface HiscoreRecord {
  user_id: string;
  username: string;
  display_name: string;
  badge_color: BadgeColor;
  is_self: boolean;
  skill_xp: Record<string, number>;
  collection_filled: number;
  collection_total: number;
}

export function sendFriendRequest(username: string): Promise<SendRequestResult> {
  return call('send_friend_request', { username });
}

export function respondToFriendRequest(requesterId: string, accept: boolean): Promise<unknown> {
  return call('respond_friend_request', { requester_id: requesterId, accept });
}

export async function removeFriend(otherId: string): Promise<void> {
  await call('remove_friend', { other_id: otherId });
}

export async function listFriends(): Promise<FriendRow[]> {
  const rows = await call<FriendRecord[]>('list_friends');
  return rows.map((row) => ({
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name,
    badgeColor: row.badge_color,
    relation: row.relation,
    since: row.since,
  }));
}

export async function fetchFeedPage(cursor: FeedCursor | null): Promise<FeedItem[]> {
  const rows = await call<FeedRecord[]>('get_feed', {
    before_at: cursor?.beforeAt ?? null,
    before_id: cursor?.beforeId ?? null,
    lim: FEED_PAGE_SIZE,
  });
  return rows.map((row) => ({
    eventId: row.event_id,
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name,
    badgeColor: row.badge_color,
    type: row.type,
    occurredAt: row.occurred_at,
    payload: row.payload ?? {},
    gzCount: row.gz_count,
    gzGiven: row.gz_given,
    isOwn: row.is_own,
  }));
}

export type GzResult = { status: 'ok'; eventId: string; given: boolean; gzCount?: number } | { status: 'not_found' };

export function setGz(eventId: string, given: boolean): Promise<GzResult> {
  return call('set_gz', { event_id: eventId, given });
}

export async function fetchHiscores(): Promise<HiscoreRow[]> {
  const rows = await call<HiscoreRecord[]>('get_hiscores');
  return rows.map((row) => ({
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name,
    badgeColor: row.badge_color,
    isSelf: row.is_self,
    skillXp: row.skill_xp,
    collectionFilled: row.collection_filled,
    collectionTotal: row.collection_total,
  }));
}

export function fetchProfileView(userId: string): Promise<ProfileView | null> {
  return call('get_profile', { target: userId });
}

export function fetchCollectionView(userId: string): Promise<CollectionView | null> {
  return call('get_collection', { target: userId });
}
