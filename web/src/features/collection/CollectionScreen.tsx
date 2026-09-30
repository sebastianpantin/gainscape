import { collectionCompletion, type CollectionExercise } from '@domain/collection.ts';
import { useCallback, useEffect, useState } from 'react';
import { type Exercise, fetchExercises } from '../../lib/catalog.ts';
import {
  type CollectionData,
  fetchCollectionData,
  pinExercise,
  reorderPins,
  unpinExercise,
} from '../../lib/collection-data.ts';
import { ExercisePicker } from '../workout/ExercisePicker.tsx';
import { ExerciseRecordCard } from './ExerciseRecordCard.tsx';

interface CollectionScreenProps {
  userId: string;
}

function isDone(exercise: Exercise, data: CollectionData): boolean {
  return data.repMaxesByExercise.has(exercise.id) || data.maxRepsByExercise.has(exercise.id);
}

function asCollectionExercise(exercise: Exercise, data: CollectionData): CollectionExercise {
  return {
    loadType: exercise.loadType,
    exactRepMaxSlotsFilled: (data.repMaxesByExercise.get(exercise.id) ?? []).filter((slot) => slot?.exact).length,
    hasBodyweightRecord: data.maxRepsByExercise.has(exercise.id),
  };
}

export function CollectionScreen({ userId }: CollectionScreenProps) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [data, setData] = useState<CollectionData | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const reload = useCallback(() => {
    Promise.all([fetchExercises({ includeArchived: true }), fetchCollectionData(userId)]).then(
      ([loadedExercises, loadedData]) => {
        setExercises(loadedExercises);
        setData(loadedData);
      },
      (error: Error) => setProblem(error.message),
    );
  }, [userId]);

  useEffect(reload, [reload]);

  if (problem)
    return (
      <main className="screen">
        <p className="problem" role="alert">
          {problem}
        </p>
      </main>
    );
  if (!data)
    return (
      <main className="screen">
        <p>Loading…</p>
      </main>
    );

  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const pinned = data.pinnedExerciseIds
    .map((id) => byId.get(id))
    .filter((exercise): exercise is Exercise => exercise !== undefined);
  const doneButNotPinned = exercises.filter(
    (exercise) => isDone(exercise, data) && !data.pinnedExerciseIds.includes(exercise.id),
  );
  const counted = [...pinned, ...doneButNotPinned];
  const completion = collectionCompletion(counted.map((exercise) => asCollectionExercise(exercise, data)));

  const togglePin = async (exercise: Exercise) => {
    try {
      if (data.pinnedExerciseIds.includes(exercise.id)) await unpinExercise(exercise.id);
      else await pinExercise(exercise.id, data.nextPinPosition);
      reload();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not update pins.');
    }
  };

  const movePin = async (exercise: Exercise, offset: -1 | 1) => {
    const order = [...data.pinnedExerciseIds];
    const from = order.indexOf(exercise.id);
    const to = from + offset;
    if (from < 0 || to < 0 || to >= order.length) return;
    [order[from], order[to]] = [order[to], order[from]];
    try {
      await reorderPins(order);
      reload();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not reorder pins.');
    }
  };

  const pinIndex = (exercise: Exercise) => data.pinnedExerciseIds.indexOf(exercise.id);

  return (
    <main className="screen stack">
      <h1 className="title">Collection log</h1>
      <div className="panel row spread">
        <span>Completion</span>
        <strong data-testid="collection-completion">
          {Math.round(completion.fraction * 100)}% ({completion.filledSlots}/{completion.totalSlots})
        </strong>
      </div>
      <ExercisePicker
        exercises={exercises.filter((exercise) => !exercise.archived && !data.pinnedExerciseIds.includes(exercise.id))}
        onPick={(exercise) => togglePin(exercise)}
      />
      {counted.length === 0 && (
        <p className="panel muted">Log a workout or pin an exercise to start your collection.</p>
      )}
      {counted.map((exercise) => (
        <ExerciseRecordCard
          key={exercise.id}
          exercise={exercise}
          data={data}
          pinned={data.pinnedExerciseIds.includes(exercise.id)}
          onTogglePin={() => togglePin(exercise)}
          onMoveUp={pinIndex(exercise) > 0 ? () => movePin(exercise, -1) : undefined}
          onMoveDown={
            pinIndex(exercise) >= 0 && pinIndex(exercise) < data.pinnedExerciseIds.length - 1
              ? () => movePin(exercise, 1)
              : undefined
          }
        />
      ))}
    </main>
  );
}
