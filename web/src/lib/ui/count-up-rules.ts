export function countUpValue(target: number, elapsedMs: number, durationMs: number, from = 0): number {
  if (durationMs <= 0 || elapsedMs >= durationMs) return target;
  const progress = Math.max(0, elapsedMs) / durationMs;
  const eased = 1 - (1 - progress) ** 3;
  return Math.min(target, Math.round(from + (target - from) * eased));
}
