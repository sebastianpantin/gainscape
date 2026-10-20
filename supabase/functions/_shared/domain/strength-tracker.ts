import type { BalanceConfig } from './balance.ts';
import { MS_PER_DAY } from './math.ts';
import { compareSessionKeys, isBefore } from './ordering.ts';
import type { ExerciseStrength, SessionKey, StrengthHistoryRow, StrengthState } from './types.ts';

interface TimedCandidate {
  startedMs: number;
  value: number;
}

interface ExerciseTrack {
  hasWorkingSet: boolean;
  undominatedCandidates: TimedCandidate[];
  latestSession: SessionKey | null;
  latestSessionMax: number | null;
}

interface StrengthTracker {
  stateAt(session: SessionKey): StrengthState;
  record(rows: readonly StrengthHistoryRow[]): void;
}

function firstIndexAtOrAfter(candidates: readonly TimedCandidate[], startedMs: number): number {
  let low = 0;
  let high = candidates.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (candidates[middle].startedMs < startedMs) low = middle + 1;
    else high = middle;
  }
  return low;
}

function keepIfUndominated(candidates: TimedCandidate[], entry: TimedCandidate): void {
  const last = candidates.at(-1);
  const position =
    last === undefined || last.startedMs < entry.startedMs
      ? candidates.length
      : firstIndexAtOrAfter(candidates, entry.startedMs);
  if (position < candidates.length && candidates[position].value >= entry.value) return;
  let firstDominated = position;
  while (firstDominated > 0 && candidates[firstDominated - 1].value <= entry.value) firstDominated -= 1;
  candidates.splice(firstDominated, position - firstDominated, entry);
}

function admit(tracks: Map<string, ExerciseTrack>, row: StrengthHistoryRow): void {
  const track = tracks.get(row.exerciseId) ?? {
    hasWorkingSet: false,
    undominatedCandidates: [],
    latestSession: null,
    latestSessionMax: null,
  };
  tracks.set(row.exerciseId, track);
  if (!row.isWarmup) track.hasWorkingSet = true;
  const candidate = row.strengthCandidate;
  if (candidate === null) return;
  keepIfUndominated(track.undominatedCandidates, { startedMs: Date.parse(row.session.startedAt), value: candidate });
  if (track.latestSession === null || compareSessionKeys(row.session, track.latestSession) > 0) {
    track.latestSession = row.session;
    track.latestSessionMax = candidate;
  } else if (row.session.id === track.latestSession.id) {
    track.latestSessionMax = Math.max(track.latestSessionMax ?? candidate, candidate);
  }
}

function windowMax(candidates: TimedCandidate[], windowStartMs: number): number | null {
  while (candidates.length > 0 && candidates[0].startedMs < windowStartMs) candidates.shift();
  return candidates.length > 0 ? candidates[0].value : null;
}

export function strengthTracker(priorRows: readonly StrengthHistoryRow[], cfg: BalanceConfig): StrengthTracker {
  const tracks = new Map<string, ExerciseTrack>();
  const prior = [...priorRows].sort((a, b) => compareSessionKeys(a.session, b.session));
  const recorded: StrengthHistoryRow[] = [];
  let priorAdmitted = 0;
  let recordedAdmitted = 0;
  let lastAnswered: SessionKey | null = null;

  return {
    stateAt(session) {
      if (lastAnswered !== null && isBefore(session, lastAnswered)) {
        throw new RangeError(`strength asked for session ${session.id} after the later ${lastAnswered.id}`);
      }
      lastAnswered = session;
      while (priorAdmitted < prior.length && isBefore(prior[priorAdmitted].session, session)) {
        admit(tracks, prior[priorAdmitted]);
        priorAdmitted += 1;
      }
      while (recordedAdmitted < recorded.length && isBefore(recorded[recordedAdmitted].session, session)) {
        admit(tracks, recorded[recordedAdmitted]);
        recordedAdmitted += 1;
      }
      const windowStartMs = Date.parse(session.startedAt) - cfg.e1rmWindowDays * MS_PER_DAY;
      const state: Record<string, ExerciseStrength> = {};
      for (const [exerciseId, track] of tracks) {
        if (!track.hasWorkingSet) continue;
        state[exerciseId] = {
          windowMax: windowMax(track.undominatedCandidates, windowStartMs),
          fallbackMax: track.latestSessionMax,
          hasPriorSession: true,
        };
      }
      return state;
    },
    record(rows) {
      for (const row of rows) {
        const previous = recorded.at(-1);
        if (previous !== undefined && isBefore(row.session, previous.session)) {
          throw new RangeError(`strength row of session ${row.session.id} recorded after ${previous.session.id}`);
        }
        recorded.push(row);
      }
    },
  };
}
