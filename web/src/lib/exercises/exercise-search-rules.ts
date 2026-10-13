const EXACT_NAME = 0;
const NAME_PREFIX = 1;
const WORD_PREFIXES = 2;
const INNER_MATCH = 3;

export interface ExerciseSearchResult<T> {
  shown: T[];
  hiddenCount: number;
}

function searchWords(text: string): string[] {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function matchTier(nameWords: readonly string[], queryWords: readonly string[]): number | null {
  const name = nameWords.join(' ');
  const query = queryWords.join(' ');
  const compactName = nameWords.join('');
  const compactQuery = queryWords.join('');
  if (name === query || compactName === compactQuery) return EXACT_NAME;
  if (name.startsWith(query) || compactName.startsWith(compactQuery)) return NAME_PREFIX;
  if (queryWords.every((word) => nameWords.some((nameWord) => nameWord.startsWith(word)))) return WORD_PREFIXES;
  const compactFromAWordStart = nameWords.some((_, index) => nameWords.slice(index).join('').startsWith(compactQuery));
  if (queryWords.every((word) => name.includes(word)) || compactFromAWordStart) return INNER_MATCH;
  return null;
}

export function exerciseSearchMatches<T extends { name: string }>(
  exercises: readonly T[],
  query: string,
  limit: number,
): ExerciseSearchResult<T> {
  const queryWords = searchWords(query);
  if (queryWords.length === 0) return { shown: [], hiddenCount: 0 };
  const ranked = exercises
    .flatMap((exercise) => {
      const nameWords = searchWords(exercise.name);
      const tier = matchTier(nameWords, queryWords);
      return tier === null ? [] : [{ exercise, tier, length: nameWords.join(' ').length }];
    })
    .sort(
      (left, right) =>
        left.tier - right.tier || left.length - right.length || left.exercise.name.localeCompare(right.exercise.name),
    );
  return {
    shown: ranked.slice(0, limit).map(({ exercise }) => exercise),
    hiddenCount: Math.max(0, ranked.length - limit),
  };
}

export function hiddenMatchesText(hiddenCount: number): string {
  return `${hiddenCount} more ${hiddenCount === 1 ? 'match' : 'matches'}. Keep typing to narrow the list.`;
}
