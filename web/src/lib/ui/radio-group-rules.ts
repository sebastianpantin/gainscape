const ARROW_STEPS: Partial<Record<string, number>> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

export function arrowedIndex(key: string, index: number, count: number): number | null {
  const step = ARROW_STEPS[key];
  return step === undefined ? null : (index + step + count) % count;
}
