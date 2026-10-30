import { MAX_SESSION_DURATION_MS } from '@domain/session-timing.ts';
import { MAX_SETS_PER_SESSION } from '@domain/types.ts';
import { BODYWEIGHT_LOAD_NOT_ZERO_CODE, UNKNOWN_EXERCISE_CODE } from '../../lib/workout/exercise-edit-rules.ts';
import { RATE_LIMITED_CODE, waitText } from '../../lib/platform/rate-limit.ts';
import { formatCount } from '../../lib/format.ts';
import type { LoadType } from '../../lib/exercises/catalog-rules.ts';
import { finishedAtFor } from '../../lib/workout/session-timing-rules.ts';
import { type WorkoutDraft } from '../../offline/draft-format.ts';
import { type FinishStatus } from '../../offline/finish-retries.ts';
import {
  doneSetCount,
  markPlannedSetsDone,
  notDoneSetCount,
  ratedNotDoneSetCount,
  plannedSetsLeftToLifter,
  withCurrentLoadTypes,
} from '../../offline/draft-edits.ts';
import type { DraftSaveProblem, StartOutcome } from '../../offline/draft-session.ts';

const EXERCISE_CHANGED_REASONS = new Set([BODYWEIGHT_LOAD_NOT_ZERO_CODE, UNKNOWN_EXERCISE_CODE]);
const LONG_SYNC_WAIT_MS = 60_000;
const MS_PER_SECOND = 1000;
const WRONG_ACCOUNT_REASON = 'wrong_account';
const MS_PER_HOUR = 3_600_000;
const TIMING_REJECTION_TEXT: Readonly<Record<string, string>> = {
  session_too_long: `This workout is longer than ${MAX_SESSION_DURATION_MS / MS_PER_HOUR} hours. Go back to editing and finish it again to save it.`,
  session_in_future: "This workout's time is ahead of the server's clock. Check the date and time on this device.",
  session_too_old:
    "This workout starts before 1970, so this device's date was probably wrong. Fix the date and time, then discard this workout and log it again.",
};

export const WAITING_DRAFT_TEXT =
  'Another unsynced workout is saved on this device. It opens when you start your next workout.';

export function startNoticeText(outcome: StartOutcome, skippedExerciseCount: number): string | null {
  if (outcome === 'opened_waiting')
    return 'Another unsynced workout saved on this device opened instead of the one you chose. Finish or discard it, then start again.';
  if (outcome === 'started' && skippedExerciseCount > 0)
    return `${skippedExerciseCount} exercise(s) in this day are no longer available and were skipped.`;
  return null;
}

export function challengeStartNoticeText(outcome: StartOutcome): string | null {
  return outcome === 'opened_waiting'
    ? 'Another unsynced workout is saved on this device. Open Workout to finish or discard it, then start the challenge.'
    : null;
}

export function syncProblemText(lastProblem: string, waitMs: number | undefined): string {
  if (lastProblem !== RATE_LIMITED_CODE) {
    return "Couldn't reach the server. Retrying while Train is open — your workout is saved on this device.";
  }
  if (waitMs !== undefined && waitMs > LONG_SYNC_WAIT_MS) {
    return `Sync limit reached; this workout will sync in ${waitText(waitMs / MS_PER_SECOND)}. It's saved on this device.`;
  }
  return "Sync limit reached; retrying shortly. It's saved on this device.";
}

export const OFFLINE_SYNC_TEXT =
  "You're offline. Your workout syncs when you're back online, here or the next time you open Train. You can close the app meanwhile.";

interface SavingState {
  status: FinishStatus;
  holding: boolean;
  offline: boolean;
  atRisk: boolean;
}

function waitsForConnection({ offline, atRisk }: SavingState): boolean {
  return offline && !atRisk;
}

export function savingTitle(state: SavingState): string {
  const { status, holding } = state;
  if (holding) return 'Saving workout…';
  if (status.kind === 'rejected' && status.reason === 'bodyweight_required') return 'One more thing';
  if (status.kind === 'rejected' || status.kind === 'stalled') return "Couldn't save workout";
  if (status.kind === 'syncing' && waitsForConnection(state)) return 'Saved on this device';
  return 'Saving workout…';
}

export function syncingStatus(state: SavingState): { text: string; retry: boolean } {
  const lastProblem = state.status.kind === 'syncing' ? state.status.lastProblem : null;
  const waitMs = state.status.kind === 'syncing' ? state.status.waitMs : undefined;
  if (lastProblem === RATE_LIMITED_CODE) return { text: syncProblemText(lastProblem, waitMs), retry: false };
  if (waitsForConnection(state)) return { text: OFFLINE_SYNC_TEXT, retry: false };
  if (lastProblem === null) return { text: 'Sending your workout…', retry: false };
  return { text: syncProblemText(lastProblem, waitMs), retry: true };
}

export function stalledSyncText(reason: string): string {
  if (reason === WRONG_ACCOUNT_REASON) {
    return "You are signed in as someone else in another tab. Reload the app to save this workout. It's saved on this device.";
  }
  return "The server keeps failing to save this workout. It's saved on this device; try again later.";
}

const DEVICE_SAVE_PROBLEM_TEXT: Readonly<Record<DraftSaveProblem, string>> = {
  unreadable:
    "Couldn't read saved workouts on this device. Reload the app to try again; new changes are still saved here.",
  unsaved: "Couldn't save your latest change on this device. Retry, and keep this tab open until it saves.",
};

export function deviceSaveProblemText(problem: DraftSaveProblem): string {
  return DEVICE_SAVE_PROBLEM_TEXT[problem];
}

export function savingAtRisk(problem: DraftSaveProblem | null): boolean {
  return problem === 'unsaved';
}

export const FINISH_WINDOW_MS = 5_000;
export const FINISH_HOLD_TEXT = 'Saving your workout in a few seconds.';
export const FINISH_WINDOW_OVERRIDE_KEY = 'gainscape.finish-window-ms';

export function finishWindowMs(override: string | null, honourOverride: boolean): number {
  if (!honourOverride || override === null || !/^\d+$/.test(override)) return FINISH_WINDOW_MS;
  return Number(override);
}

export function finishSyncDelayMs(finishedAt: number, now: number, windowMs: number): number {
  return Math.min(windowMs, Math.max(0, finishedAt + windowMs - now));
}

export function rejectionText(reason: string): string {
  if (Object.hasOwn(TIMING_REJECTION_TEXT, reason)) return TIMING_REJECTION_TEXT[reason];
  return EXERCISE_CHANGED_REASONS.has(reason)
    ? 'Load type of an exercise changed; check the weights'
    : "The server couldn't accept this workout. Go back to editing to check it, or discard it.";
}

interface FinishCounts {
  done: number;
  planned: number;
  leftToLifter: number;
  rated: number;
}

interface FinishChoice {
  label: string;
  marksPlannedDone: boolean;
}

interface FinishPrompt {
  title: string;
  body: string;
  confirm: FinishChoice;
  alternative: FinishChoice | null;
}

export const SETS_FULL_TEXT = `A workout can hold at most ${MAX_SETS_PER_SESSION} sets.`;

const MARK_DONE: FinishChoice = { label: 'Mark done and finish', marksPlannedDone: true };
const WITHOUT_THEM: FinishChoice = { label: 'Finish without them', marksPlannedDone: false };
const LEFT_TO_LIFTER_TEXT = '5RM tests and optional sets stay skipped until you log them.';

export function finishCountsOf(draft: WorkoutDraft): FinishCounts {
  return {
    done: doneSetCount(draft),
    planned: notDoneSetCount(draft),
    leftToLifter: plannedSetsLeftToLifter(draft),
    rated: ratedNotDoneSetCount(draft),
  };
}

export function canFinishWorkout({ done, planned, leftToLifter }: FinishCounts): boolean {
  return done + planned - leftToLifter > 0;
}

export function finishBlockedText(counts: FinishCounts): string | null {
  if (canFinishWorkout(counts)) return null;
  return counts.done + counts.planned === 0 ? 'Add an exercise to finish.' : 'Log a set to finish.';
}

function ratedNotTickedText(rated: number): string[] {
  if (rated === 0) return [];
  return [`${formatCount(rated, 'rated set')} ${rated === 1 ? "isn't" : "aren't"} ticked done.`];
}

export function finishPrompt({ done, planned, leftToLifter, rated }: FinishCounts): FinishPrompt | null {
  if (planned === 0) return null;
  const title = `${formatCount(planned, 'set')} not ticked`;
  const leftNote = leftToLifter > 0 ? [LEFT_TO_LIFTER_TEXT] : [];
  if (planned === leftToLifter) {
    return { title, body: leftNote.join(' '), confirm: WITHOUT_THEM, alternative: null };
  }
  const choice =
    done > 0 ? 'Log them as done, or keep only the sets you ticked.' : 'No set is ticked yet. Log them all as done?';
  const body = [...ratedNotTickedText(rated), choice, ...leftNote].join(' ');
  if (done === 0) return { title, body, confirm: MARK_DONE, alternative: null };
  if (rated === 0) return { title, body, confirm: WITHOUT_THEM, alternative: MARK_DONE };
  return { title, body, confirm: MARK_DONE, alternative: WITHOUT_THEM };
}

interface FinishOptions {
  sessionId: string;
  loadTypes: ReadonlyMap<string, LoadType>;
  markPlannedDone: boolean;
  now: Date;
}

export function finishDraft(
  latest: WorkoutDraft,
  { sessionId, loadTypes, markPlannedDone, now }: FinishOptions,
): { draft: WorkoutDraft; changedNames: string[] } {
  if (latest.sessionId !== sessionId || latest.finishedAt) return { draft: latest, changedNames: [] };
  const checked = withCurrentLoadTypes(latest, loadTypes);
  if (checked.changedNames.length > 0) return checked;
  const logged = markPlannedDone ? markPlannedSetsDone(checked.draft) : checked.draft;
  return { draft: { ...logged, finishedAt: finishedAtFor(logged.startedAt, now) }, changedNames: [] };
}

export function loadTypeChangedText(changedNames: readonly string[]): string {
  return `Load type of ${changedNames.join(', ')} changed; check the weights`;
}
