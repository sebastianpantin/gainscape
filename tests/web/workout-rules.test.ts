import { describe, expect, it } from 'vitest';
import {
  canFinishWorkout,
  deviceSaveProblemText,
  finishPrompt,
  rejectionText,
  stalledSyncText,
  syncProblemText,
} from '../../web/src/features/workout/workout-rules.ts';

describe('syncProblemText', () => {
  it('names the network problem and reassures the workout is kept', () => {
    expect(syncProblemText('offline', 2_000)).toBe(
      "Couldn't reach the server (offline). Retrying — your workout is saved on this device.",
    );
  });

  it('says when a long sync limit wait ends', () => {
    expect(syncProblemText('rate_limited', 5 * 60_000)).toBe(
      "Sync limit reached; this workout will sync in 5 min. It's saved on this device.",
    );
  });

  it('says a short or unknown sync limit wait retries shortly', () => {
    const shortly = "Sync limit reached; retrying shortly. It's saved on this device.";
    expect(syncProblemText('rate_limited', 60_000)).toBe(shortly);
    expect(syncProblemText('rate_limited', undefined)).toBe(shortly);
  });
});

describe('stalledSyncText', () => {
  it('says the server keeps failing and that the workout is kept', () => {
    expect(stalledSyncText('internal_error')).toBe(
      "The server keeps failing to save this workout (internal_error). It's saved on this device; try again later.",
    );
  });

  it('asks to reload when another account is signed in', () => {
    expect(stalledSyncText('wrong_account')).toBe(
      "You are signed in as someone else in another tab. Reload the app to save this workout. It's saved on this device.",
    );
  });
});

describe('rejectionText', () => {
  it('asks to check the weights when an exercise changed under the workout', () => {
    for (const reason of ['bodyweight_load_not_zero', 'unknown_exercise'])
      expect(rejectionText(reason)).toBe('Load type of an exercise changed; check the weights');
  });

  it('explains a workout longer than the server accepts', () => {
    expect(rejectionText('session_too_long')).toBe(
      'This workout is longer than 12 hours. Go back to editing and finish it again to save it.',
    );
  });

  it('asks to check the device clock when the workout is ahead of the server', () => {
    expect(rejectionText('session_in_future')).toBe(
      "This workout's time is ahead of the server's clock. Check the date and time on this device.",
    );
  });

  it('blames the device date when the workout starts before 1970', () => {
    expect(rejectionText('session_too_old')).toBe(
      "This workout starts before 1970, so this device's date was probably wrong. Fix the date and time, then discard this workout and log it again.",
    );
  });

  it('shows any other rejection reason', () => {
    expect(rejectionText('invalid_payload')).toBe('The server rejected this workout: invalid_payload');
  });
});

describe('finishPrompt', () => {
  it('asks nothing when every set is done', () => {
    expect(finishPrompt({ done: 3, planned: 0, leftToLifter: 0 })).toBeNull();
  });

  it('offers to mark planned sets done or to finish without them', () => {
    expect(finishPrompt({ done: 2, planned: 1, leftToLifter: 0 })).toEqual({
      title: '1 planned set not done',
      body: 'Log them as done, or keep only the sets you ticked.',
      confirm: { label: 'Mark done and finish', marksPlannedDone: true },
      alternative: { label: 'Finish without them', marksPlannedDone: false },
    });
  });

  it('only offers marking done when nothing is ticked yet', () => {
    expect(finishPrompt({ done: 0, planned: 18, leftToLifter: 0 })).toEqual({
      title: '18 planned sets not done',
      body: 'No set is ticked yet. Log the planned sets as done?',
      confirm: { label: 'Mark done and finish', marksPlannedDone: true },
      alternative: null,
    });
  });

  it('says 5RM tests and optional sets stay skipped, and only finishes when nothing else is planned', () => {
    expect(finishPrompt({ done: 3, planned: 4, leftToLifter: 1 })?.body).toBe(
      'Log them as done, or keep only the sets you ticked. 5RM tests and optional sets stay skipped until you log them.',
    );
    expect(finishPrompt({ done: 3, planned: 2, leftToLifter: 2 })).toEqual({
      title: '2 planned sets not done',
      body: '5RM tests and optional sets stay skipped until you log them.',
      confirm: { label: 'Finish without them', marksPlannedDone: false },
      alternative: null,
    });
  });
});

describe('canFinishWorkout', () => {
  it('needs a done set or a planned set that marking done would log', () => {
    expect(canFinishWorkout({ done: 0, planned: 3, leftToLifter: 0 })).toBe(true);
    expect(canFinishWorkout({ done: 1, planned: 1, leftToLifter: 1 })).toBe(true);
    expect(canFinishWorkout({ done: 0, planned: 1, leftToLifter: 1 })).toBe(false);
    expect(canFinishWorkout({ done: 0, planned: 0, leftToLifter: 0 })).toBe(false);
  });
});

describe('deviceSaveProblemText', () => {
  it('says saved workouts could not be read when the main store failed at boot', () => {
    expect(deviceSaveProblemText('unreadable')).toBe(
      "Couldn't read saved workouts on this device. Reload the app to try again; new changes are still saved here.",
    );
  });

  it('says a change could not be saved when every store failed', () => {
    expect(deviceSaveProblemText('unsaved')).toBe("Couldn't save on this device");
  });
});
