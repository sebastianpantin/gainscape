import { type Exercise, exerciseLabels } from '../exercises/catalog-rules.ts';

const BASIS_POINTS_PER_PERCENT = 100;

export function sharePercentText(shareBasisPoints: number): string {
  return `${shareBasisPoints / BASIS_POINTS_PER_PERCENT}%`;
}

interface PickerRowDetail {
  kind: string;
  skills: string | null;
}

export function pickerRowDetail(exercise: Exercise): PickerRowDetail {
  const kind = [exercise.modality === 'cardio' ? 'cardio' : exercise.equipment, exerciseLabels(exercise)]
    .join(' ')
    .trim();
  const skills = exercise.skillShares.map((share) => share.skillName).join(' · ');
  return { kind, skills: skills || null };
}

interface SkillShareRow {
  name: string;
  percent: string;
}

export function skillShareRows(exercise: Exercise): SkillShareRow[] {
  return exercise.skillShares.map((share) => ({
    name: share.skillName,
    percent: sharePercentText(share.shareBasisPoints),
  }));
}

interface SkillExerciseEntry {
  id: string;
  name: string;
  percent: string;
}

export function exercisesTrainingSkill(exercises: readonly Exercise[], skillKey: string): SkillExerciseEntry[] {
  return exercises
    .filter((exercise) => !exercise.archived)
    .flatMap((exercise) => {
      const shareBasisPoints = exercise.skillShares.find((share) => share.skillKey === skillKey)?.shareBasisPoints ?? 0;
      return shareBasisPoints > 0 ? [{ exercise, shareBasisPoints }] : [];
    })
    .sort((a, b) => b.shareBasisPoints - a.shareBasisPoints || a.exercise.name.localeCompare(b.exercise.name))
    .map(({ exercise, shareBasisPoints }) => ({
      id: exercise.id,
      name: exercise.name,
      percent: sharePercentText(shareBasisPoints),
    }));
}

export function skillExercisesSeed(cached: Exercise[] | null): Exercise[] | undefined {
  return cached?.some((exercise) => exercise.skillShares.length > 0) ? cached : undefined;
}
