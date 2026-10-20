import type { BalanceConfig } from './balance.ts';
import { compareSessionKeys } from './ordering.ts';
import { processSession, type SessionOutputs } from './pipeline.ts';
import { strengthHistoryRows } from './strength.ts';
import { strengthTracker } from './strength-tracker.ts';
import { applyXpGrant } from './xp.ts';
import type { Catalog, SessionInput, SessionKey, StrengthHistoryRow, StrengthState, UserState } from './types.ts';

export interface ReplayedSession {
  session: SessionInput;
  strengthAtStart: StrengthState;
  outputs: SessionOutputs;
}

interface ReplayResult {
  sessions: ReplayedSession[];
  finalState: UserState;
}

export interface SkillXpGrant {
  at: SessionKey;
  xpBySkill: Readonly<Record<string, number>>;
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
  const strengthSoFar = strengthTracker(priorStrength, cfg);
  const replayed: ReplayedSession[] = [];
  let state = initialState;

  for (const session of ordered) {
    const dueCount = pendingGrants.findIndex((grant) => compareSessionKeys(grant.at, session) >= 0);
    state = withGrants(state, pendingGrants.splice(0, dueCount === -1 ? pendingGrants.length : dueCount), cfg);
    const strength = strengthSoFar.stateAt(session);
    const { nextState, outputs } = processSession(state, session, cfg, { catalog, strength });
    strengthSoFar.record(strengthHistoryRows(session, outputs.sets));
    replayed.push({ session, strengthAtStart: strength, outputs });
    state = nextState;
  }
  return { sessions: replayed, finalState: withGrants(state, pendingGrants, cfg) };
}

export function priorSkillXp(sums: Readonly<Record<string, number>>, cfg: BalanceConfig): Record<string, number> {
  return applyXpGrant({}, sums, cfg);
}
