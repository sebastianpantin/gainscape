const INVISIBLE_BLANKS = String.fromCharCode(0xfeff, 0x200b);
const SURROUNDING_BLANKS = new RegExp(`^[\\s${INVISIBLE_BLANKS}]+|[\\s${INVISIBLE_BLANKS}]+$`, 'g');
export const CONTROL_CHARACTER = /\p{Cc}/u;
const BIDI_CONTROL = /[\u202A-\u202E\u2066-\u2069]/u;

export function characterCount(text: string): number {
  return [...text].length;
}

export function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function trimmedName(raw: string): string {
  return raw.replace(SURROUNDING_BLANKS, '');
}

export function nameProblem(raw: string, longest: number): string | null {
  const name = trimmedName(raw);
  if (name === '') return 'Enter a name.';
  if (CONTROL_CHARACTER.test(name) || BIDI_CONTROL.test(name)) return "Names can't contain control characters.";
  if (characterCount(name) > longest) return `Names can be at most ${longest} characters.`;
  return null;
}
