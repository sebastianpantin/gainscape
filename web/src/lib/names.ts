const INVISIBLE_BLANKS = String.fromCharCode(0xfeff, 0x200b);
const SURROUNDING_BLANKS = new RegExp(`^[\\s${INVISIBLE_BLANKS}]+|[\\s${INVISIBLE_BLANKS}]+$`, 'g');
const CONTROL_CHARACTER = /\p{Cc}/u;

export function trimmedName(raw: string): string {
  return raw.replace(SURROUNDING_BLANKS, '');
}

export function nameProblem(raw: string, longest: number): string | null {
  const name = trimmedName(raw);
  if (name === '') return 'Enter a name.';
  if (CONTROL_CHARACTER.test(name)) return "Names can't contain control characters.";
  if (name.length > longest) return `Names can be at most ${longest} characters.`;
  return null;
}
