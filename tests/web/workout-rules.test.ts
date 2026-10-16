import { describe, expect, it } from 'vitest';
import {
  canFinishWorkout,
  deviceSaveProblemText,
  finishDraft,
  finishPrompt,
  loadTypeChangedText,
  rejectionText,
  stalledSyncText,
  challengeStartNoticeText,
  startNoticeText,
  syncProblemText,
  WAITING_DRAFT_TEXT,
} from '../../web/src/features/workout/workout-rules.ts';
import type { LoadType } from '../../web/src/lib/exercises/catalog-rules.ts';
import type { WorkoutDraft } from '../../web/src/offline/draft-format.ts';

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

  it('offers to mark the sets not ticked done or to finish without them', () => {
    expect(finishPrompt({ done: 2, planned: 1, leftToLifter: 0 })).toEqual({
      title: '1 set not ticked',
      body: 'Log them as done, or keep only the sets you ticked.',
      confirm: { label: 'Mark done and finish', marksPlannedDone: true },
      alternative: { label: 'Finish without them', marksPlannedDone: false },
    });
  });

  it('only offers marking done when nothing is ticked yet', () => {
    expect(finishPrompt({ done: 0, planned: 18, leftToLifter: 0 })).toEqual({
      title: '18 sets not ticked',
      body: 'No set is ticked yet. Log them all as done?',
      confirm: { label: 'Mark done and finish', marksPlannedDone: true },
      alternative: null,
    });
  });

  it('says 5RM tests and optional sets stay skipped, and only finishes when nothing else is planned', () => {
    expect(finishPrompt({ done: 3, planned: 4, leftToLifter: 1 })?.body).toBe(
      'Log them as done, or keep only the sets you ticked. 5RM tests and optional sets stay skipped until you log them.',
    );
    expect(finishPrompt({ done: 3, planned: 2, leftToLifter: 2 })).toEqual({
      title: '2 sets not ticked',
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

describe('WAITING_DRAFT_TEXT', () => {
  it('says the waiting workout opens at the next start, not when this one ends', () => {
    expect(WAITING_DRAFT_TEXT).toBe(
      'Another unsynced workout is saved on this device. It opens when you start your next workout.',
    );
  });
});

describe('startNoticeText', () => {
  it('explains that a waiting workout opened instead of the chosen start', () => {
    expect(startNoticeText('opened_waiting', 2)).toBe(
      'Another unsynced workout saved on this device opened instead of the one you chose. Finish or discard it, then start again.',
    );
  });

  it('counts the exercises skipped from a freshly started day', () => {
    expect(startNoticeText('started', 2)).toBe('2 exercise(s) in this day are no longer available and were skipped.');
  });

  it('says nothing for a fresh start without skips or a resumed workout', () => {
    expect(startNoticeText('started', 0)).toBeNull();
    expect(startNoticeText('resumed', 3)).toBeNull();
  });
});

describe('challengeStartNoticeText', () => {
  it('points to the Workout tab when a waiting workout opened instead of the challenge', () => {
    expect(challengeStartNoticeText('opened_waiting')).toBe(
      'Another unsynced workout is saved on this device. Open Workout to finish or discard it, then start the challenge.',
    );
  });

  it('says nothing when the challenge started or a workout resumed', () => {
    expect(challengeStartNoticeText('started')).toBeNull();
    expect(challengeStartNoticeText('resumed')).toBeNull();
  });
});

describe('finishDraft', () => {
  const startedAt = '2026-10-01T10:00:00.000Z';
  const now = new Date('2026-10-01T11:00:00.000Z');
  const plannedSet = {
    id: 'p1',
    weightKg: 40,
    reps: 8,
    effort: null,
    done: false,
    isWarmup: false,
    prescription: null,
  };
  const draft = (): WorkoutDraft => ({
    sessionId: 'session',
    startedAt,
    finishedAt: null,
    programDayId: null,
    programLabel: null,
    exercises: [
      {
        clientId: 'card-dip',
        exerciseId: 'dip',
        name: 'Dip',
        modality: 'lift',
        loadType: 'bodyweight_plus',
        target: null,
        supersetId: null,
        sets: [{ ...plannedSet, id: 'd1', weightKg: 10, done: true }, plannedSet],
      },
    ],
  });
  const options = { sessionId: 'session', loadTypes: new Map(), markPlannedDone: false, now };

  it('stamps the finish time and keeps planned sets as they are', () => {
    const { draft: finished, changedNames } = finishDraft(draft(), options);
    expect(changedNames).toEqual([]);
    expect(finished.finishedAt).toBe('2026-10-01T11:00:00.000Z');
    expect(finished.exercises[0].sets.map((set) => set.done)).toEqual([true, false]);
  });

  it('marks planned sets done when asked', () => {
    const { draft: finished } = finishDraft(draft(), { ...options, markPlannedDone: true });
    expect(finished.exercises[0].sets.map((set) => set.done)).toEqual([true, true]);
  });

  it('does not finish when a load type changed, and names the exercise with its weights reset', () => {
    const loadTypes = new Map<string, LoadType>([['dip', 'bodyweight']]);
    const { draft: checked, changedNames } = finishDraft(draft(), { ...options, loadTypes, markPlannedDone: true });
    expect(changedNames).toEqual(['Dip']);
    expect(checked.finishedAt).toBeNull();
    const [dip] = checked.exercises;
    if (dip.modality !== 'lift') throw new Error('expected a lift');
    expect(dip.sets.map((set) => [set.weightKg, set.done])).toEqual([
      [0, true],
      [0, false],
    ]);
    expect(loadTypeChangedText(changedNames)).toBe('Load type of Dip changed; check the weights');
  });

  it('leaves another session or an already finished draft alone', () => {
    expect(finishDraft(draft(), { ...options, sessionId: 'other' })).toEqual({ draft: draft(), changedNames: [] });
    const finished = { ...draft(), finishedAt: startedAt };
    expect(finishDraft(finished, options)).toEqual({ draft: finished, changedNames: [] });
  });
});
