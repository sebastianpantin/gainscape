export interface SeededRandom {
  next(): number;
  integerBetween(lowest: number, highest: number): number;
}

export function seededRandom(seed: number): SeededRandom {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
  return { next, integerBetween: (lowest, highest) => lowest + Math.floor(next() * (highest - lowest + 1)) };
}
