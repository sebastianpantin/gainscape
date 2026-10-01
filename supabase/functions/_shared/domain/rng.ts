import type { Rng, RollKind } from './types.ts';

const SFC32_SEED_BYTES = 16;
const SFC32_DISCARDED_OUTPUTS = 12;
const UINT32_RANGE = 2 ** 32;

export function lootSeedMessage(userId: string, setId: string, kind: RollKind): string {
  return `${userId}:${setId}:${kind}`;
}

export function sfc32FromSeed(seed: Uint8Array): Rng {
  if (seed.byteLength < SFC32_SEED_BYTES) throw new RangeError(`sfc32 needs ${SFC32_SEED_BYTES} seed bytes`);
  const view = new DataView(seed.buffer, seed.byteOffset, seed.byteLength);
  let a = view.getUint32(0, true);
  let b = view.getUint32(4, true);
  let c = view.getUint32(8, true);
  let d = view.getUint32(12, true);
  const nextUint32 = (): number => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };
  for (let discarded = 0; discarded < SFC32_DISCARDED_OUTPUTS; discarded += 1) nextUint32();
  return { next: () => nextUint32() / UINT32_RANGE };
}
