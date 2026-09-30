import type { BalanceConfig } from './balance.ts';
import { compareSessionKeys } from './ordering.ts';
import { DEFAULT_STEPS, processSession, type SessionOutputs, type Step } from './pipeline.ts';
import { strengthHistoryRows, strengthStateAt } from './strength.ts';
import type { Catalog, SessionInput, StrengthHistoryRow, StrengthState, UserState } from './types.ts';

export interface ReplayedSession {
  session: SessionInput;
  strengthAtStart: StrengthState;
  outputs: SessionOutputs;
}

export interface ReplayResult {
  sessions: ReplayedSession[];
  finalState: UserState;
}

export function replayHistory(
  sessions: readonly SessionInput[],
  catalog: Catalog,
  cfg: BalanceConfig,
  initialState: UserState = { skillXp: {}, bodyweightKg: null },
  steps: readonly Step[] = DEFAULT_STEPS,
  priorStrength: readonly StrengthHistoryRow[] = [],
): ReplayResult {
  const ordered = [...sessions].sort(compareSessionKeys);
  const history: StrengthHistoryRow[] = [...priorStrength];
  const replayed: ReplayedSession[] = [];
  let state = initialState;

  for (const session of ordered) {
    const strength = strengthStateAt(history, session, cfg);
    const { nextState, outputs } = processSession(state, session, cfg, { catalog, strength }, steps);
    history.push(...strengthHistoryRows(session, outputs.sets));
    replayed.push({ session, strengthAtStart: strength, outputs });
    state = nextState;
  }
  return { sessions: replayed, finalState: state };
}

export function priorSkillXp(sums: Readonly<Record<string, number>>, cfg: BalanceConfig): Record<string, number> {
  return Object.fromEntries(Object.entries(sums).map(([skillId, xp]) => [skillId, Math.min(cfg.maxXp, xp)]));
}
