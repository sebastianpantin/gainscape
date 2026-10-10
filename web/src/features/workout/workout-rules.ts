import { MAX_SESSION_DURATION_MS } from '@domain/session-timing.ts';
import { RATE_LIMITED_CODE, waitText } from '../../lib/rate-limit.ts';
import type { DraftSaveProblem, StartOutcome } from '../../offline/draft-session.ts';

const EXERCISE_CHANGED_REASONS = new Set(['bodyweight_load_not_zero', 'unknown_exercise']);
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

export function syncProblemText(lastProblem: string, waitMs: number | undefined): string {
  if (lastProblem !== RATE_LIMITED_CODE) {
    return `Couldn't reach the server (${lastProblem}). Retrying — your workout is saved on this device.`;
  }
  if (waitMs !== undefined && waitMs > LONG_SYNC_WAIT_MS) {
    return `Sync limit reached; this workout will sync in ${waitText(waitMs / MS_PER_SECOND)}. It's saved on this device.`;
  }
  return "Sync limit reached; retrying shortly. It's saved on this device.";
}

export function stalledSyncText(reason: string): string {
  if (reason === WRONG_ACCOUNT_REASON) {
    return "You are signed in as someone else in another tab. Reload the app to save this workout. It's saved on this device.";
  }
  return `The server keeps failing to save this workout (${reason}). It's saved on this device; try again later.`;
}

const DEVICE_SAVE_PROBLEM_TEXT: Readonly<Record<DraftSaveProblem, string>> = {
  unreadable:
    "Couldn't read saved workouts on this device. Reload the app to try again; new changes are still saved here.",
  unsaved: "Couldn't save on this device",
};

export function deviceSaveProblemText(problem: DraftSaveProblem): string {
  return DEVICE_SAVE_PROBLEM_TEXT[problem];
}

export function rejectionText(reason: string): string {
  if (Object.hasOwn(TIMING_REJECTION_TEXT, reason)) return TIMING_REJECTION_TEXT[reason];
  return EXERCISE_CHANGED_REASONS.has(reason)
    ? 'Load type of an exercise changed; check the weights'
    : `The server rejected this workout: ${reason}`;
}

export interface FinishCounts {
  done: number;
  planned: number;
  leftToLifter: number;
}

export interface FinishChoice {
  label: string;
  marksPlannedDone: boolean;
}

export interface FinishPrompt {
  title: string;
  body: string;
  confirm: FinishChoice;
  alternative: FinishChoice | null;
}

const MARK_DONE: FinishChoice = { label: 'Mark done and finish', marksPlannedDone: true };
const WITHOUT_THEM: FinishChoice = { label: 'Finish without them', marksPlannedDone: false };
const LEFT_TO_LIFTER_TEXT = '5RM tests and optional sets stay skipped until you log them.';

export function canFinishWorkout({ done, planned, leftToLifter }: FinishCounts): boolean {
  return done + planned - leftToLifter > 0;
}

export function finishPrompt({ done, planned, leftToLifter }: FinishCounts): FinishPrompt | null {
  if (planned === 0) return null;
  const title = `${planned} planned ${planned === 1 ? 'set' : 'sets'} not done`;
  const leftNote = leftToLifter > 0 ? [LEFT_TO_LIFTER_TEXT] : [];
  if (planned === leftToLifter) {
    return { title, body: leftNote.join(' '), confirm: WITHOUT_THEM, alternative: null };
  }
  const choice =
    done > 0
      ? 'Log them as done, or keep only the sets you ticked.'
      : 'No set is ticked yet. Log the planned sets as done?';
  return {
    title,
    body: [choice, ...leftNote].join(' '),
    confirm: MARK_DONE,
    alternative: done > 0 ? WITHOUT_THEM : null,
  };
}
