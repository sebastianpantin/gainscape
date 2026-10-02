import { describe, expect, it } from 'vitest';
import { rejectionText, syncProblemText } from '../../web/src/features/workout/workout-rules.ts';

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

describe('rejectionText', () => {
  it('asks to check the weights when an exercise changed under the workout', () => {
    for (const reason of ['bodyweight_load_not_zero', 'unknown_exercise'])
      expect(rejectionText(reason)).toBe('Load type of an exercise changed; check the weights');
  });

  it('shows any other rejection reason', () => {
    expect(rejectionText('invalid_payload')).toBe('The server rejected this workout: invalid_payload');
  });
});
