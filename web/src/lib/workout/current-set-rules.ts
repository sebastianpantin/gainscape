import { type WorkoutDraft } from '../../offline/draft-format.ts';
import { roundRows, supersetGroups } from './superset-rules.ts';

function setsInTrainingOrder(draft: WorkoutDraft): { id: string; done: boolean }[] {
  const groups = supersetGroups(draft);
  return draft.exercises.flatMap((exercise, exerciseIndex) => {
    const group = groups.find((candidate) => candidate.exerciseIndexes.includes(exerciseIndex));
    if (group === undefined) return exercise.sets;
    if (group.exerciseIndexes[0] !== exerciseIndex) return [];
    return roundRows(draft, group).flatMap((row) =>
      row.cells.flatMap((cell) => draft.exercises[cell.exerciseIndex].sets.filter((set) => set.id === cell.setId)),
    );
  });
}

export function currentSetId(draft: WorkoutDraft): string | null {
  const sets = setsInTrainingOrder(draft);
  const afterLastDone = sets.slice(sets.map((set) => set.done).lastIndexOf(true) + 1);
  return (afterLastDone[0] ?? sets.find((set) => !set.done))?.id ?? null;
}
