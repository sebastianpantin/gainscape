import { addSet, type DraftExercise, type WorkoutDraft, withValidSupersets } from '../offline/draft-format.ts';
import { roomForSets, updateExerciseAt } from './exercise-edit-rules.ts';

export interface SupersetGroup {
  id: string;
  exerciseIndexes: number[];
}

export interface RoundCell {
  exerciseIndex: number;
  setId: string | null;
}

export interface RoundRow {
  round: number;
  cells: RoundCell[];
}

function supersetIdAt(draft: WorkoutDraft, exerciseIndex: number): string | null {
  const exercise = draft.exercises[exerciseIndex];
  return exercise?.modality === 'lift' ? (exercise.supersetId ?? null) : null;
}

export function supersetGroups(draft: WorkoutDraft): SupersetGroup[] {
  const groups: SupersetGroup[] = [];
  draft.exercises.forEach((_, index) => {
    const id = supersetIdAt(draft, index);
    if (id === null) return;
    const last = groups.at(-1);
    if (last?.id === id && last.exerciseIndexes.at(-1) === index - 1) last.exerciseIndexes.push(index);
    else groups.push({ id, exerciseIndexes: [index] });
  });
  return groups.filter((group) => group.exerciseIndexes.length > 1);
}

function groupOf(draft: WorkoutDraft, exerciseIndex: number): SupersetGroup | undefined {
  return supersetGroups(draft).find((group) => group.exerciseIndexes.includes(exerciseIndex));
}

function withSupersetId(draft: WorkoutDraft, exerciseIndexes: number[], supersetId: string | null): WorkoutDraft {
  return exerciseIndexes.reduce(
    (current, index) =>
      updateExerciseAt(current, index, (exercise: DraftExercise) =>
        exercise.modality === 'lift' ? { ...exercise, supersetId } : exercise,
      ),
    draft,
  );
}

export function groupWithNext(draft: WorkoutDraft, exerciseIndex: number): WorkoutDraft {
  const next = draft.exercises[exerciseIndex + 1];
  if (draft.exercises[exerciseIndex]?.modality !== 'lift' || next?.modality !== 'lift') return draft;
  const nextId = supersetIdAt(draft, exerciseIndex + 1);
  const ownId = supersetIdAt(draft, exerciseIndex);
  if (nextId !== null && nextId === ownId) return draft;
  const nextMembers = groupOf(draft, exerciseIndex + 1)?.exerciseIndexes ?? [exerciseIndex + 1];
  const grouped =
    ownId === null && nextId !== null
      ? withSupersetId(draft, [exerciseIndex], nextId)
      : withSupersetId(draft, [exerciseIndex, ...nextMembers], ownId ?? crypto.randomUUID());
  return { ...grouped, exercises: withValidSupersets(grouped.exercises) };
}

function movedAfter(exercises: DraftExercise[], fromIndex: number, afterIndex: number): DraftExercise[] {
  const moved = exercises.filter((_, index) => index !== fromIndex);
  moved.splice(afterIndex, 0, exercises[fromIndex]);
  return moved;
}

export function ungroup(draft: WorkoutDraft, exerciseIndex: number): WorkoutDraft {
  if (supersetIdAt(draft, exerciseIndex) === null) return draft;
  const ungrouped = withSupersetId(draft, [exerciseIndex], null);
  const members = groupOf(draft, exerciseIndex)?.exerciseIndexes ?? [];
  const lastMember = members.at(-1) ?? exerciseIndex;
  const isMiddleMember = members[0] < exerciseIndex && exerciseIndex < lastMember;
  const exercises = isMiddleMember ? movedAfter(ungrouped.exercises, exerciseIndex, lastMember) : ungrouped.exercises;
  return { ...ungrouped, exercises: withValidSupersets(exercises) };
}

export function roundRows(draft: WorkoutDraft, group: SupersetGroup): RoundRow[] {
  const roundCount = Math.max(0, ...group.exerciseIndexes.map((index) => draft.exercises[index]?.sets.length ?? 0));
  return Array.from({ length: roundCount }, (_, round) => ({
    round: round + 1,
    cells: group.exerciseIndexes.map((exerciseIndex) => ({
      exerciseIndex,
      setId: draft.exercises[exerciseIndex]?.sets[round]?.id ?? null,
    })),
  }));
}

export function nextInRound(
  draft: WorkoutDraft,
  exerciseIndex: number,
  setId: string,
): { exerciseIndex: number; setId: string } | null {
  const group = groupOf(draft, exerciseIndex);
  if (group === undefined) return null;
  const round = draft.exercises[exerciseIndex].sets.findIndex((set) => set.id === setId);
  if (round === -1) return null;
  for (const index of group.exerciseIndexes.filter((member) => member > exerciseIndex)) {
    const set = draft.exercises[index].sets[round];
    if (set !== undefined) return { exerciseIndex: index, setId: set.id };
  }
  return null;
}

export function restsAfter(draft: WorkoutDraft, exerciseIndex: number, setId: string): boolean {
  return nextInRound(draft, exerciseIndex, setId) === null;
}

export function canAddRound(draft: WorkoutDraft, group: SupersetGroup): boolean {
  return group.exerciseIndexes.length <= roomForSets(draft);
}

export function addRound(draft: WorkoutDraft, group: SupersetGroup): WorkoutDraft {
  if (!canAddRound(draft, group)) return draft;
  return group.exerciseIndexes.reduce((current, index) => addSet(current, index), draft);
}
