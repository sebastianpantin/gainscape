import { describe, expect, it } from 'vitest';
import { PROGRAM_OFFLINE_TEXT, programErrorText } from '../../web/src/lib/program-error-rules.ts';

function databaseError(message: string, code = 'P0001') {
  return { code, message, details: null, hint: null };
}

describe('program error text', () => {
  it.each([
    ['invalid_enrollment', "These numbers can't start the program. Check them and try again."],
    ['unknown_template', 'This program is no longer available.'],
    ['unknown_exercise', 'One of the chosen exercises is no longer available. Pick another one.'],
    ['enrollment_ended', 'This program was stopped on another device.'],
    ['enrollment_not_found', 'This program was stopped on another device.'],
    ['invalid_event', "That change can't be saved. Check the numbers and try again."],
  ])('maps the %s database error to a friendly message', (code, text) => {
    expect(programErrorText(databaseError(code))).toBe(text);
  });

  it('maps the rate limit code PT429 to "Too many changes, try again later"', () => {
    expect(programErrorText(databaseError('rate limited', 'PT429'))).toBe('Too many changes, try again later');
  });

  it('maps a rate_limited error to "Too many changes, try again later"', () => {
    expect(programErrorText({ code: 'rate_limited', message: 'rate_limited' })).toBe(
      'Too many changes, try again later',
    );
  });

  it('asks to sign in again when not authenticated', () => {
    expect(programErrorText(databaseError('not_authenticated', '42501'))).toBe('Sign in again to change your program.');
  });

  it('maps a failed fetch to a connection message', () => {
    expect(programErrorText(new TypeError('Failed to fetch'))).toBe(
      "Couldn't reach the server. Check your connection.",
    );
    expect(programErrorText({ code: '', message: 'TypeError: Failed to fetch', details: '' })).toBe(
      "Couldn't reach the server. Check your connection.",
    );
  });

  it('never shows raw database text for an unknown error', () => {
    const text = programErrorText(databaseError('duplicate key value violates unique constraint', '23505'));
    expect(text).toBe('Something went wrong. Try again.');
  });

  it('gives the generic message for a value that is not an error', () => {
    expect(programErrorText('boom')).toBe('Something went wrong. Try again.');
    expect(programErrorText(null)).toBe('Something went wrong. Try again.');
  });

  it('reads the offline text word for word', () => {
    expect(PROGRAM_OFFLINE_TEXT).toBe("You're offline. Starting or editing a program needs a connection.");
  });
});
