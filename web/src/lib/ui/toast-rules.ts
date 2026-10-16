const BASE_MS = 5000;
const MS_PER_CHARACTER = 50;
const LONGEST_MS = 9000;
const CHARACTERS_READ_IN_BASE = 40;
const WITH_ACTION_MS = 12000;

export function toastDurationMs(text: string, hasAction = false): number {
  if (hasAction) return WITH_ACTION_MS;
  const extraCharacters = Math.max(0, text.length - CHARACTERS_READ_IN_BASE);
  return Math.min(LONGEST_MS, BASE_MS + extraCharacters * MS_PER_CHARACTER);
}
