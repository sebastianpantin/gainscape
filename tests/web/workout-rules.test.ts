import { describe, expect, it } from 'vitest';
import {
  canFinishWorkout,
  finishBlockedText,
  deviceSaveProblemText,
  FINISH_WINDOW_MS,
  finishDraft,
  finishSyncDelayMs,
  finishWindowMs,
  finishPrompt,
  loadTypeChangedText,
  OFFLINE_SYNC_TEXT,
  rejectionText,
  savingAtRisk,
  savingTitle,
  stalledSyncText,
  challengeStartNoticeText,
  startNoticeText,
  syncProblemText,
  WAITING_DRAFT_TEXT,
} from '../../web/src/features/workout/workout-rules.ts';
import type { LoadType } from '../../web/src/lib/exercises/catalog-rules.ts';
import type { WorkoutDraft } from '../../web/src/offline/draft-format.ts';

describe('syncProblemText', () => {
  it('names the network problem, says retries run while Train is open and that the workout is kept', () => {
    expect(syncProblemText('offline', 2_000)).toBe(
      "Couldn't reach the server. Retrying while Train is open — your workout is saved on this device.",
    );
  });

  it('never shows the raw problem code', () => {
    for (const code of ['offline', 'Failed to fetch', 'internal_error', 'storage_error'])
      expect(syncProblemText(code, 2_000)).not.toContain(code);
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
      "The server keeps failing to save this workout. It's saved on this device; try again later.",
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

  it('explains any other rejection in words, without the code', () => {
    expect(rejectionText('invalid_payload')).toBe(
      "The server couldn't accept this workout. Go back to editing to check it, or discard it.",
    );
  });
});

describe('finishPrompt', () => {
  it('asks nothing when every set is done', () => {
    expect(finishPrompt({ done: 3, planned: 0, leftToLifter: 0, rated: 0 })).toBeNull();
  });

  it('makes finishing without the sets not ticked the default once a set is ticked', () => {
    expect(finishPrompt({ done: 2, planned: 1, leftToLifter: 0, rated: 0 })).toEqual({
      title: '1 set not ticked',
      body: 'Log them as done, or keep only the sets you ticked.',
      confirm: { label: 'Finish without them', marksPlannedDone: false },
      alternative: { label: 'Mark done and finish', marksPlannedDone: true },
    });
  });

  it('only offers marking done when nothing is ticked yet', () => {
    expect(finishPrompt({ done: 0, planned: 18, leftToLifter: 0, rated: 0 })).toEqual({
      title: '18 sets not ticked',
      body: 'No set is ticked yet. Log them all as done?',
      confirm: { label: 'Mark done and finish', marksPlannedDone: true },
      alternative: null,
    });
  });

  it('says 5RM tests and optional sets stay skipped, and only finishes when nothing else is planned', () => {
    expect(finishPrompt({ done: 3, planned: 4, leftToLifter: 1, rated: 0 })?.body).toBe(
      'Log them as done, or keep only the sets you ticked. 5RM tests and optional sets stay skipped until you log them.',
    );
    expect(finishPrompt({ done: 3, planned: 2, leftToLifter: 2, rated: 0 })).toEqual({
      title: '2 sets not ticked',
      body: '5RM tests and optional sets stay skipped until you log them.',
      confirm: { label: 'Finish without them', marksPlannedDone: false },
      alternative: null,
    });
  });
});

describe('finishPrompt with rated sets', () => {
  it('names rated sets that are not ticked and still marks them done first', () => {
    expect(finishPrompt({ done: 2, planned: 3, leftToLifter: 0, rated: 3 })).toEqual({
      title: '3 sets not ticked',
      body: "3 rated sets aren't ticked done. Log them as done, or keep only the sets you ticked.",
      confirm: { label: 'Mark done and finish', marksPlannedDone: true },
      alternative: { label: 'Finish without them', marksPlannedDone: false },
    });
    expect(finishPrompt({ done: 0, planned: 2, leftToLifter: 0, rated: 1 })?.body).toBe(
      "1 rated set isn't ticked done. No set is ticked yet. Log them all as done?",
    );
  });
});

describe('canFinishWorkout', () => {
  it('needs a done set or a planned set that marking done would log', () => {
    expect(canFinishWorkout({ done: 0, planned: 3, leftToLifter: 0, rated: 0 })).toBe(true);
    expect(canFinishWorkout({ done: 1, planned: 1, leftToLifter: 1, rated: 0 })).toBe(true);
    expect(canFinishWorkout({ done: 0, planned: 1, leftToLifter: 1, rated: 0 })).toBe(false);
    expect(canFinishWorkout({ done: 0, planned: 0, leftToLifter: 0, rated: 0 })).toBe(false);
  });
});

describe('finishBlockedText', () => {
  it('asks for an exercise while the workout has no set at all', () => {
    expect(finishBlockedText({ done: 0, planned: 0, leftToLifter: 0, rated: 0 })).toBe('Add an exercise to finish.');
  });

  it('asks for a logged set when only 5RM tests or optional sets are left', () => {
    expect(finishBlockedText({ done: 0, planned: 2, leftToLifter: 2, rated: 0 })).toBe('Log a set to finish.');
  });

  it('says nothing once the workout can finish', () => {
    expect(finishBlockedText({ done: 1, planned: 0, leftToLifter: 0, rated: 0 })).toBeNull();
    expect(finishBlockedText({ done: 0, planned: 3, leftToLifter: 0, rated: 0 })).toBeNull();
  });
});

describe('deviceSaveProblemText', () => {
  it('says saved workouts could not be read when the main store failed at boot', () => {
    expect(deviceSaveProblemText('unreadable')).toBe(
      "Couldn't read saved workouts on this device. Reload the app to try again; new changes are still saved here.",
    );
  });

  it('says a change could not be saved when every store failed', () => {
    expect(deviceSaveProblemText('unsaved')).toBe(
      "Couldn't save your latest change on this device. Retry, and keep this tab open until it saves.",
    );
  });
});

describe('savingAtRisk', () => {
  it('holds only when a change could not be saved anywhere', () => {
    expect(savingAtRisk('unsaved')).toBe(true);
    expect(savingAtRisk('unreadable')).toBe(false);
    expect(savingAtRisk(null)).toBe(false);
  });
});

describe('finishSyncDelayMs', () => {
  const finishedAt = Date.parse('2026-10-28T10:00:00Z');

  it('waits the rest of the window after the finish', () => {
    expect(finishSyncDelayMs(finishedAt, finishedAt + 1_500, 5_000)).toBe(3_500);
  });

  it('sends at once when the window has passed', () => {
    expect(finishSyncDelayMs(finishedAt, finishedAt + 9_000, 5_000)).toBe(0);
    expect(finishSyncDelayMs(finishedAt, finishedAt, 0)).toBe(0);
  });

  it('never waits longer than the window when the clock is behind the finish', () => {
    expect(finishSyncDelayMs(finishedAt, finishedAt - 60_000, 5_000)).toBe(5_000);
  });
});

describe('finishWindowMs', () => {
  it('is five seconds in a production build, whatever the override says', () => {
    expect(FINISH_WINDOW_MS).toBe(5_000);
    expect(finishWindowMs('0', false)).toBe(5_000);
    expect(finishWindowMs(null, false)).toBe(5_000);
  });

  it('honours a whole, non-negative override in a development build', () => {
    expect(finishWindowMs('0', true)).toBe(0);
    expect(finishWindowMs('1200', true)).toBe(1_200);
  });

  it('ignores a missing or unreadable override in a development build', () => {
    for (const override of [null, '', 'soon', '-5', '1.5']) expect(finishWindowMs(override, true)).toBe(5_000);
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

describe('savingTitle', () => {
  const syncing = { kind: 'syncing', attempt: 1, lastProblem: null } as const;

  it('says saving during the wait after Finish, even offline', () => {
    expect(savingTitle({ kind: 'idle' }, true, true)).toBe('Saving workout…');
  });

  it('says saving while a send is on its way online', () => {
    expect(savingTitle(syncing, false, false)).toBe('Saving workout…');
    expect(savingTitle({ ...syncing, lastProblem: 'offline' }, false, false)).toBe('Saving workout…');
  });

  it('says the workout is saved on the device while offline', () => {
    expect(savingTitle({ ...syncing, lastProblem: 'offline' }, false, true)).toBe('Saved on this device');
  });

  it('says the save failed once retries stalled or the server rejected the workout', () => {
    expect(savingTitle({ kind: 'stalled', reason: 'internal_error' }, false, false)).toBe("Couldn't save workout");
    expect(savingTitle({ kind: 'rejected', reason: 'invalid_payload' }, false, false)).toBe("Couldn't save workout");
  });

  it('asks for one more thing when the server needs a bodyweight', () => {
    expect(savingTitle({ kind: 'rejected', reason: 'bodyweight_required' }, false, false)).toBe('One more thing');
  });
});

describe('OFFLINE_SYNC_TEXT', () => {
  it('says the workout is kept, when it syncs and that the app may close', () => {
    expect(OFFLINE_SYNC_TEXT).toBe(
      "You're offline. Your workout is saved on this device and syncs once you're back online and open Train. You can close the app meanwhile.",
    );
  });
});
