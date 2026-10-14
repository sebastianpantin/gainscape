import type { BalanceConfig } from './balance.ts';
import { compareSessionKeys } from './ordering.ts';
import { processSession, type SessionOutputs } from './pipeline.ts';
import { strengthHistoryRows, strengthStateAt } from './strength.ts';
import type { Catalog, SessionInput, SessionKey, StrengthHistoryRow, StrengthState, UserState } from './types.ts';

export interface ReplayedSession {
  session: SessionInput;
  strengthAtStart: StrengthState;
  outputs: SessionOutputs;
}

export interface ReplayResult {
  sessions: ReplayedSession[];
  finalState: UserState;
}

export interface SkillXpGrant {
  at: SessionKey;
  xpBySkill: Readonly<Record<string, number>>;
}

export function applyXpGrant(
  skillXp: Readonly<Record<string, number>>,
  xpBySkill: Readonly<Record<string, number>>,
  cfg: Pick<BalanceConfig, 'maxXp'>,
): Record<string, number> {
  const granted: Record<string, number> = { ...skillXp };
  for (const [skillId, xp] of Object.entries(xpBySkill)) {
    granted[skillId] = Math.min(cfg.maxXp, (granted[skillId] ?? 0) + xp);
  }
  return granted;
}

function withGrants(state: UserState, grants: readonly SkillXpGrant[], cfg: BalanceConfig): UserState {
  const skillXp = grants.reduce((total, grant) => applyXpGrant(total, grant.xpBySkill, cfg), state.skillXp);
  return { ...state, skillXp };
}

export function replayHistory(
  sessions: readonly SessionInput[],
  catalog: Catalog,
  cfg: BalanceConfig,
  initialState: UserState = { skillXp: {}, bodyweightKg: null },
  priorStrength: readonly StrengthHistoryRow[] = [],
  grants: readonly SkillXpGrant[] = [],
): ReplayResult {
  const ordered = [...sessions].sort(compareSessionKeys);
  const pendingGrants = [...grants].sort((a, b) => compareSessionKeys(a.at, b.at));
  const history: StrengthHistoryRow[] = [...priorStrength];
  const replayed: ReplayedSession[] = [];
  let state = initialState;

  for (const session of ordered) {
    const dueCount = pendingGrants.findIndex((grant) => compareSessionKeys(grant.at, session) >= 0);
    state = withGrants(state, pendingGrants.splice(0, dueCount === -1 ? pendingGrants.length : dueCount), cfg);
    const strength = strengthStateAt(history, session, cfg);
    const { nextState, outputs } = processSession(state, session, cfg, { catalog, strength });
    history.push(...strengthHistoryRows(session, outputs.sets));
    replayed.push({ session, strengthAtStart: strength, outputs });
    state = nextState;
  }
  return { sessions: replayed, finalState: withGrants(state, pendingGrants, cfg) };
}

export function priorSkillXp(sums: Readonly<Record<string, number>>, cfg: BalanceConfig): Record<string, number> {
  return Object.fromEntries(Object.entries(sums).map(([skillId, xp]) => [skillId, Math.min(cfg.maxXp, xp)]));
}
