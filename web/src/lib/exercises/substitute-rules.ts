import { searchWords } from './exercise-search-rules.ts';

export interface SubstituteCandidate {
  id: string;
  name: string;
  archived: boolean;
  skillShares: readonly { skillKey: string; shareBasisPoints: number }[];
}

const SETUP_WORDS = new Set([
  'barbell',
  'dumbbell',
  'cable',
  'machine',
  'smith',
  'kettlebell',
  'weighted',
  'band',
  'bodyweight',
  'assisted',
  'ez',
  'bar',
  'seated',
  'standing',
  'incline',
  'decline',
  'single',
  'arm',
  'leg',
]);

function movementWords(name: string): Set<string> {
  return new Set(searchWords(name).filter((word) => !SETUP_WORDS.has(word)));
}

function topSkillsOf(exercise: SubstituteCandidate): Set<string> {
  const largest = Math.max(0, ...exercise.skillShares.map((share) => share.shareBasisPoints));
  return new Set(
    exercise.skillShares
      .filter((share) => share.shareBasisPoints === largest && largest > 0)
      .map((share) => share.skillKey),
  );
}

function shareOverlap(original: SubstituteCandidate, candidate: SubstituteCandidate): number {
  return original.skillShares.reduce((overlap, share) => {
    const matching = candidate.skillShares.find((other) => other.skillKey === share.skillKey);
    return overlap + Math.min(share.shareBasisPoints, matching?.shareBasisPoints ?? 0);
  }, 0);
}

export function similarExercises<T extends SubstituteCandidate>(
  original: T,
  candidates: readonly T[],
  limit: number,
): T[] {
  const topSkills = topSkillsOf(original);
  if (topSkills.size === 0) return [];
  const originalWords = movementWords(original.name);
  return candidates
    .filter(
      (candidate) =>
        candidate.id !== original.id &&
        !candidate.archived &&
        [...topSkillsOf(candidate)].some((skill) => topSkills.has(skill)),
    )
    .map((candidate) => ({
      candidate,
      sharesMovement: [...movementWords(candidate.name)].some((word) => originalWords.has(word)),
      overlap: shareOverlap(original, candidate),
    }))
    .sort(
      (left, right) =>
        Number(right.sharesMovement) - Number(left.sharesMovement) ||
        right.overlap - left.overlap ||
        left.candidate.name.localeCompare(right.candidate.name),
    )
    .slice(0, limit)
    .map(({ candidate }) => candidate);
}
