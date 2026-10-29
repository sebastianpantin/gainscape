export function countUpValue(target: number, elapsedMs: number, durationMs: number, from = 0): number {
  if (durationMs <= 0 || elapsedMs >= durationMs) return target;
  const progress = Math.max(0, elapsedMs) / durationMs;
  const eased = 1 - (1 - progress) ** 3;
  return Math.min(target, Math.round(from + (target - from) * eased));
}

export const COUNT_UP_MS = 800;

export interface CountUpRun {
  from: number;
  to: number;
}

export function countUpStart(lastSeen: number | null, current: number, reducedMotion: boolean): number {
  return !reducedMotion && lastSeen !== null && lastSeen < current ? lastSeen : current;
}

export function shownCountUp({ from, to }: CountUpRun, elapsedMs: number): number {
  return countUpValue(to, elapsedMs, COUNT_UP_MS, from);
}
