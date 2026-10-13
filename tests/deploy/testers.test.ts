import { describe, expect, it } from 'vitest';
import { MINIMUM_PASSWORD_LENGTH } from '../../web/src/lib/platform/auth-links.ts';
import { inviteProblems, oneTimePassword, testerArguments } from '../../scripts/deploy/testers.ts';

describe('tester arguments', () => {
  it('reads EMAIL and USERNAME from make variables', () => {
    expect(testerArguments({ EMAIL: 'Mira@Example.test', USERNAME: 'Mira_Lifts' })).toEqual({
      email: 'mira@example.test',
      username: 'mira_lifts',
    });
  });

  it('accepts a valid invite', () => {
    expect(inviteProblems({ email: 'mira@example.test', username: 'mira_lifts' })).toEqual([]);
  });

  it('refuses a username the profile trigger would reject, and a malformed email', () => {
    expect(inviteProblems({ email: 'not-an-email', username: 'no' })).toEqual([
      'EMAIL must be an email address',
      'USERNAME must be 3–20 characters: lowercase letters, digits, underscore',
    ]);
  });
});

describe('one-time password', () => {
  it('is long enough for the password rule and uses an unambiguous alphabet', () => {
    const password = oneTimePassword();
    expect(password.length).toBeGreaterThanOrEqual(MINIMUM_PASSWORD_LENGTH + 8);
    expect(password).toMatch(/^[A-HJ-NP-Za-km-z2-9-]+$/);
  });

  it('differs every time', () => {
    expect(new Set(Array.from({ length: 50 }, oneTimePassword)).size).toBe(50);
  });
});
