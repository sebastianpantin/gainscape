import type { EffortLevel } from '@domain/types.ts';
import type { LoadType } from '../lib/catalog.ts';

const DRAFT_FORMAT_VERSION = 1;
const STARTING_EXTERNAL_LOAD_KG = 20;

export interface DraftSet {
  id: string;
  weightKg: number;
  reps: number;
  effortLevel: EffortLevel | null;
}

export interface DraftExercise {
  exerciseId: string;
  name: string;
  loadType: LoadType;
  sets: DraftSet[];
}

export interface WorkoutDraft {
  sessionId: string;
  startedAt: string;
  finishedAt: string | null;
  exercises: DraftExercise[];
}

interface StoredDraft {
  v: typeof DRAFT_FORMAT_VERSION;
  userId: string;
  draft: WorkoutDraft;
}

function storageKeyFor(userId: string): string {
  return `gainscape.workout-draft.${userId}`;
}

function withLoadTypes(draft: WorkoutDraft): WorkoutDraft {
  const exercisesFromBeforeLoadTypes = draft.exercises.map((exercise) => ({
    ...exercise,
    loadType: exercise.loadType ?? 'external',
  }));
  return { ...draft, exercises: exercisesFromBeforeLoadTypes };
}

export function loadDraft(userId: string): WorkoutDraft | null {
  try {
    const raw = localStorage.getItem(storageKeyFor(userId));
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredDraft;
    if (stored.v !== DRAFT_FORMAT_VERSION || stored.userId !== userId) return null;
    return withLoadTypes(stored.draft);
  } catch {
    return null;
  }
}

export function saveDraft(userId: string, draft: WorkoutDraft): void {
  const stored: StoredDraft = { v: DRAFT_FORMAT_VERSION, userId, draft };
  try {
    localStorage.setItem(storageKeyFor(userId), JSON.stringify(stored));
  } catch {
    return;
  }
}

export function discardDraft(userId: string): void {
  try {
    localStorage.removeItem(storageKeyFor(userId));
  } catch {
    return;
  }
}

export function startDraft(): WorkoutDraft {
  return { sessionId: crypto.randomUUID(), startedAt: new Date().toISOString(), finishedAt: null, exercises: [] };
}

export function addExercise(draft: WorkoutDraft, exerciseId: string, name: string, loadType: LoadType): WorkoutDraft {
  return { ...draft, exercises: [...draft.exercises, { exerciseId, name, loadType, sets: [] }] };
}

export function removeExercise(draft: WorkoutDraft, exerciseIndex: number): WorkoutDraft {
  return { ...draft, exercises: draft.exercises.filter((_, index) => index !== exerciseIndex) };
}

export function addSet(draft: WorkoutDraft, exerciseIndex: number): WorkoutDraft {
  return updateExercise(draft, exerciseIndex, (exercise) => {
    const previous = exercise.sets.at(-1);
    const newSet: DraftSet = {
      id: crypto.randomUUID(),
      weightKg: previous?.weightKg ?? (exercise.loadType === 'external' ? STARTING_EXTERNAL_LOAD_KG : 0),
      reps: previous?.reps ?? 8,
      effortLevel: null,
    };
    return { ...exercise, sets: [...exercise.sets, newSet] };
  });
}

export function updateSet(
  draft: WorkoutDraft,
  exerciseIndex: number,
  setId: string,
  changes: Partial<Omit<DraftSet, 'id'>>,
): WorkoutDraft {
  return updateExercise(draft, exerciseIndex, (exercise) => ({
    ...exercise,
    sets: exercise.sets.map((set) => (set.id === setId ? { ...set, ...changes } : set)),
  }));
}

export function removeSet(draft: WorkoutDraft, exerciseIndex: number, setId: string): WorkoutDraft {
  return updateExercise(draft, exerciseIndex, (exercise) => ({
    ...exercise,
    sets: exercise.sets.filter((set) => set.id !== setId),
  }));
}

function updateExercise(
  draft: WorkoutDraft,
  exerciseIndex: number,
  update: (exercise: DraftExercise) => DraftExercise,
): WorkoutDraft {
  return {
    ...draft,
    exercises: draft.exercises.map((exercise, index) => (index === exerciseIndex ? update(exercise) : exercise)),
  };
}

export function loggedSetCount(draft: WorkoutDraft): number {
  return draft.exercises.reduce((count, exercise) => count + exercise.sets.length, 0);
}
