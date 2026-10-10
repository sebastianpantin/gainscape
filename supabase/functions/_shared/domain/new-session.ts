import type { BalanceConfig } from './balance.ts';
import { isWithinEditWindow } from './edit-window.ts';
import { resolveHistoryOnlySets, type WritableSet, writableSetFor } from './pipeline.ts';
import type { Catalog, SessionInput, SetInput, SetResult } from './types.ts';

export type WritableSession = Omit<SessionInput, 'sets'> & { sets: WritableSet[] };

export interface NewSessionDraft {
  id: string;
  startedAt: string;
  sets: readonly SetInput[];
}

export type NewSessionPlan =
  { mode: 'scored'; session: WritableSession } | { mode: 'history_only'; session: WritableSession; sets: SetResult[] };

export function planNewSession(
  draft: NewSessionDraft,
  catalog: Catalog,
  bodyweightKg: number | null,
  now: number,
  cfg: BalanceConfig,
): NewSessionPlan {
  const session: WritableSession = {
    id: draft.id,
    startedAt: draft.startedAt,
    sets: draft.sets.map((set): WritableSet => {
      const writable = writableSetFor(set, catalog.exercises.get(set.exerciseId)!, bodyweightKg);
      return writable.kind === 'cardio' ? writable : { ...writable, recordedEffectiveLoadKg: writable.effectiveLoadKg };
    }),
  };
  if (isWithinEditWindow(draft.startedAt, now)) return { mode: 'scored', session };
  return { mode: 'history_only', session, sets: resolveHistoryOnlySets(session, cfg, { catalog }) };
}
