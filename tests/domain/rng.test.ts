import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { lootSeedMessage, sfc32FromSeed } from '@domain/index.ts';

const referenceSeed = Uint8Array.from({ length: 32 }, (_, index) => index);

describe('sfc32FromSeed', () => {
  it('pins the first 4 outputs for seed bytes 0x00..0x1f', () => {
    const rng = sfc32FromSeed(referenceSeed);
    expect([rng.next(), rng.next(), rng.next(), rng.next()]).toEqual([
      0.3458148830104619, 0.28004584298469126, 0.41474524908699095, 0.01589484210126102,
    ]);
  });

  it('reads only the first 16 bytes', () => {
    expect(sfc32FromSeed(referenceSeed.subarray(0, 16)).next()).toBe(sfc32FromSeed(referenceSeed).next());
  });

  it('rejects a seed shorter than 16 bytes', () => {
    expect(() => sfc32FromSeed(new Uint8Array(15))).toThrow(RangeError);
  });

  it('keeps every output in [0, 1)', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 16, maxLength: 32 }), (seed) => {
        const rng = sfc32FromSeed(seed);
        for (let draw = 0; draw < 50; draw += 1) {
          const value = rng.next();
          if (!(value >= 0 && value < 1)) return false;
        }
        return true;
      }),
    );
  });

  it('gives the same stream for the same seed', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 16, maxLength: 16 }), (seed) => {
        const first = sfc32FromSeed(seed);
        const second = sfc32FromSeed(Uint8Array.from(seed));
        return Array.from({ length: 20 }, () => first.next() === second.next()).every(Boolean);
      }),
    );
  });
});

describe('lootSeedMessage', () => {
  it('joins the user, set and kind', () => {
    expect(lootSeedMessage('u1', 'abc', 'pr')).toBe('u1:abc:pr');
  });
});
