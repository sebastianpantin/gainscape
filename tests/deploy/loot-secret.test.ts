import { describe, expect, it } from 'vitest';
import { lootSecretDecision, MIN_LOOT_SECRET_LENGTH } from '../../scripts/loot-secret.ts';

const strongSecret = 'a'.repeat(MIN_LOOT_SECRET_LENGTH);

describe('lootSecretDecision', () => {
  it('creates a secret when there is no env file', () => {
    expect(lootSecretDecision(null)).toBe('create');
  });

  it('accepts an existing secret of at least 32 characters on any line', () => {
    expect(MIN_LOOT_SECRET_LENGTH).toBe(32);
    expect(lootSecretDecision(`LOOT_SECRET=${strongSecret}\n`)).toBe('accept');
    expect(lootSecretDecision(`OTHER=1\nLOOT_SECRET= ${strongSecret} \n`)).toBe('accept');
  });

  it('rejects a short secret instead of overwriting it', () => {
    expect(lootSecretDecision(`LOOT_SECRET=${strongSecret.slice(1)}\n`)).toBe('reject');
  });

  it('rejects an env file without a secret, even an empty one', () => {
    expect(lootSecretDecision('')).toBe('reject');
    expect(lootSecretDecision('OTHER=1\n')).toBe('reject');
    expect(lootSecretDecision('LOOT_SECRET=\n')).toBe('reject');
    expect(lootSecretDecision(`# LOOT_SECRET=${strongSecret}\n`)).toBe('reject');
  });
});
