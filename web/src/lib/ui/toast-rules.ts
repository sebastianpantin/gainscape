const BASE_MS = 5000;
const MS_PER_CHARACTER = 50;
const LONGEST_MS = 9000;
const CHARACTERS_READ_IN_BASE = 40;

export function toastDurationMs(text: string): number {
  const extraCharacters = Math.max(0, text.length - CHARACTERS_READ_IN_BASE);
  return Math.min(LONGEST_MS, BASE_MS + extraCharacters * MS_PER_CHARACTER);
}
