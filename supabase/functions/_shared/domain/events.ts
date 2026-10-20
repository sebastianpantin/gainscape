import { DEFAULT_FEED, type FeedConfig, type ItemRarityRank } from './balance.ts';
import { MAX_LEVEL } from './levels.ts';
import {
  CARDIO_RECORD_KINDS,
  type CardioRecordKind,
  type CardioRecordSummary,
  type LevelUp,
  type LiftRecordSummary,
  type LoadType,
  type QuestIdentity,
  type SessionSummary,
} from './types.ts';

export interface FeedSourceSet {
  id: string;
  effectiveLoadKg: number | null;
}

type FeedEventType = 'pr' | 'level_up' | 'level_99' | 'drop' | 'quest';

interface FeedEventDraft {
  key: string;
  type: FeedEventType;
  setId: string | null;
  payload: Record<string, string | number | null>;
}

export interface QuestEventDraft {
  key: string;
  type: 'quest';
  payload: {
    questId: string;
    questKey: string;
    name: string;
    questPoints: number;
    levelUps: LevelUp[];
  };
}

export interface FeedExercise {
  builtIn: boolean;
  loadType: LoadType | null;
}

const RARITY_ORDER: readonly ItemRarityRank[] = ['common', 'uncommon', 'rare', 'legendary'];

export function isFeedLevelUp(from: number, to: number, cfg: FeedConfig = DEFAULT_FEED): boolean {
  return Math.floor(to / cfg.levelMilestone) > Math.floor(from / cfg.levelMilestone) || to >= cfg.levelAlwaysFrom;
}

function levelEvents(summary: SessionSummary, cfg: FeedConfig): FeedEventDraft[] {
  return (summary.levelUps ?? []).flatMap(({ skill, from, to }): FeedEventDraft[] => {
    const type = to === MAX_LEVEL ? 'level_99' : isFeedLevelUp(from, to, cfg) ? 'level_up' : null;
    return type === null ? [] : [{ key: `level:${skill}`, type, setId: null, payload: { skill, from, to } }];
  });
}

function liftPrEvent(
  pr: LiftRecordSummary,
  exercise: FeedExercise,
  setsById: ReadonlyMap<string, FeedSourceSet>,
): FeedEventDraft {
  const source = setsById.get(pr.setId) ?? null;
  const totalLoadKg = exercise.loadType === 'bodyweight_plus' ? (source?.effectiveLoadKg ?? null) : null;
  return {
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
  };
}

const CARDIO_PAYLOAD_FIELDS: Record<CardioRecordKind, { value: string; previous: string }> = {
  distance: { value: 'distanceM', previous: 'previousDistanceM' },
  pace: { value: 'paceSPerKm', previous: 'previousPaceSPerKm' },
  duration: { value: 'countedWorkS', previous: 'previousCountedWorkS' },
};

function cardioPrEvent(pr: CardioRecordSummary, setsById: ReadonlyMap<string, FeedSourceSet>): FeedEventDraft {
  const payload: Record<string, string | number | null> = {
    exerciseId: pr.exerciseId,
    kind: 'cardio',
    recordKinds: pr.records.map((record) => record.kind).join(','),
  };
  for (const kind of CARDIO_RECORD_KINDS) {
    const fields = CARDIO_PAYLOAD_FIELDS[kind];
    const record = pr.records.find((candidate) => candidate.kind === kind);
    payload[fields.value] = record?.value ?? null;
    payload[fields.previous] = record?.previous ?? null;
  }
  return { key: `pr:${pr.setId}`, type: 'pr', setId: setsById.has(pr.setId) ? pr.setId : null, payload };
}

function prEvents(
  summary: SessionSummary,
  sets: readonly FeedSourceSet[],
  exercises: ReadonlyMap<string, FeedExercise>,
): FeedEventDraft[] {
  const setsById = new Map(sets.map((set) => [set.id, set]));
  return (summary.prs ?? []).flatMap((pr): FeedEventDraft[] => {
    const exercise = exercises.get(pr.exerciseId);
    if (!exercise?.builtIn) return [];
    return [pr.kind === 'cardio' ? cardioPrEvent(pr, setsById) : liftPrEvent(pr, exercise, setsById)];
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

export function questCompletedEvent(quest: QuestIdentity, levelUps: readonly LevelUp[]): QuestEventDraft {
  return {
    key: `quest:${quest.key}`,
    type: 'quest',
    payload: {
      questId: quest.questId,
      questKey: quest.key,
      name: quest.name,
      questPoints: quest.questPoints,
      levelUps: [...levelUps],
    },
  };
}
