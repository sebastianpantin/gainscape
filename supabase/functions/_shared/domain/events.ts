import { DEFAULT_FEED, type FeedConfig, type ItemRarityRank } from './balance.ts';
import { MAX_LEVEL } from './levels.ts';
import { roundTo } from './strength.ts';
import type { LoadType, PersonalRecordSummary, SessionSummary } from './types.ts';

export interface FeedSourceSet {
  id: string;
  exerciseId: string;
  position: number;
  weightKg: number;
  reps: number;
  isWarmup: boolean;
  effectiveLoadKg: number;
}

export type FeedEventType = 'pr' | 'level_up' | 'level_99' | 'drop';

export interface FeedEventDraft {
  key: string;
  type: FeedEventType;
  setId: string | null;
  payload: Record<string, string | number | null>;
}

export interface FeedExercise {
  builtIn: boolean;
  loadType: LoadType;
}

const RARITY_ORDER: readonly ItemRarityRank[] = ['common', 'uncommon', 'rare', 'legendary'];

export function isFeedLevelUp(from: number, to: number, cfg: FeedConfig = DEFAULT_FEED): boolean {
  return Math.floor(to / cfg.levelMilestone) > Math.floor(from / cfg.levelMilestone) || to >= cfg.levelAlwaysFrom;
}

function prSourceSet(pr: PersonalRecordSummary, sets: readonly FeedSourceSet[]): FeedSourceSet | null {
  const matches = sets
    .filter((set) => set.exerciseId === pr.exerciseId && !set.isWarmup)
    .filter((set) =>
      pr.kind === 'rep_max' ? set.reps >= pr.reps && roundTo(2, set.weightKg) === pr.loadKg : set.reps === pr.reps,
    )
    .sort((a, b) => a.position - b.position);
  return matches[0] ?? null;
}

function levelEvents(summary: SessionSummary, cfg: FeedConfig): FeedEventDraft[] {
  return (summary.levelUps ?? []).flatMap(({ skill, from, to }): FeedEventDraft[] => {
    const type = to === MAX_LEVEL ? 'level_99' : isFeedLevelUp(from, to, cfg) ? 'level_up' : null;
    return type === null ? [] : [{ key: `level:${skill}`, type, setId: null, payload: { skill, from, to } }];
  });
}

function prEvents(
  summary: SessionSummary,
  sets: readonly FeedSourceSet[],
  exercises: ReadonlyMap<string, FeedExercise>,
): FeedEventDraft[] {
  return (summary.prs ?? []).flatMap((pr): FeedEventDraft[] => {
    const exercise = exercises.get(pr.exerciseId);
    if (!exercise?.builtIn) return [];
    const source = prSourceSet(pr, sets);
    const totalLoadKg = exercise.loadType === 'bodyweight_plus' && source ? source.effectiveLoadKg : null;
    return [
      {
        key: `pr:${pr.exerciseId}`,
        type: 'pr',
        setId: source?.id ?? null,
        payload: {
          exerciseId: pr.exerciseId,
          kind: pr.kind,
          reps: pr.reps,
          loadKg: pr.loadKg,
          previousLoadKg: pr.previousLoadKg,
          previousReps: pr.previousReps,
          totalLoadKg,
        },
      },
    ];
  });
}

function dropEvents(
  summary: SessionSummary,
  itemRarity: ReadonlyMap<string, ItemRarityRank>,
  cfg: FeedConfig,
): FeedEventDraft[] {
  const minRank = RARITY_ORDER.indexOf(cfg.dropMinRarity);
  return (summary.drops ?? []).flatMap((drop): FeedEventDraft[] => {
    const rarity = itemRarity.get(drop.itemId);
    if (rarity === undefined || RARITY_ORDER.indexOf(rarity) < minRank) return [];
    return [
      {
        key: `drop:${drop.dropId}`,
        type: 'drop',
        setId: drop.setId,
        payload: {
          dropId: drop.dropId,
          itemId: drop.itemId,
          itemKey: drop.itemKey,
          quantity: drop.quantity,
          source: drop.source,
        },
      },
    ];
  });
}

export function feedEventsForSession(
  summary: SessionSummary,
  sets: readonly FeedSourceSet[],
  exercises: ReadonlyMap<string, FeedExercise>,
  itemRarity: ReadonlyMap<string, ItemRarityRank>,
  cfg: FeedConfig = DEFAULT_FEED,
): FeedEventDraft[] {
  if (summary.historyOnly) return [];
  return [...levelEvents(summary, cfg), ...prEvents(summary, sets, exercises), ...dropEvents(summary, itemRarity, cfg)];
}
