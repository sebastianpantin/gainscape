import { describe, expect, it } from 'vitest';
import { messageOf } from '../../web/src/lib/error-text.ts';

describe('messageOf', () => {
  it('uses the message of an Error', () => {
    expect(messageOf(new Error('Your password is wrong.'), 'Could not save.')).toBe('Your password is wrong.');
    expect(messageOf(new TypeError('Failed to fetch'), 'Could not save.')).toBe('Failed to fetch');
  });

  it('uses the fallback for anything that is not an Error', () => {
    expect(messageOf({ message: 'not an Error' }, 'Could not save.')).toBe('Could not save.');
    expect(messageOf('oops', 'Could not save.')).toBe('Could not save.');
    expect(messageOf(null, 'Could not save.')).toBe('Could not save.');
  });
});
