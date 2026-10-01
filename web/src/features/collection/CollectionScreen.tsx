import { useCallback, useEffect, useState } from 'react';
import { cardioRecordCards } from '../../lib/cardio-rules.ts';
import { type CardioExercise, type Exercise, fetchExercises } from '../../lib/catalog.ts';
import { usePreferences } from '../../lib/preferences.ts';
import { moved } from '../../lib/reorder.ts';
import {
  type CollectionData,
  countCollection,
  fetchCollectionData,
  pinExercise,
  reorderPins,
  unpinExercise,
} from '../../lib/collection-data.ts';
import { SegmentedNav } from '../../components/SegmentedNav.tsx';
import { ExercisePicker } from '../workout/ExercisePicker.tsx';
import { ExerciseRecordCard } from './ExerciseRecordCard.tsx';

interface CollectionScreenProps {
  userId: string;
}

export function CollectionTabs() {
  return (
    <SegmentedNav
      label="Collection"
      links={[
        { to: '/collection', label: 'Records' },
        { to: '/collection/items', label: 'Items' },
        { to: '/collection/history', label: 'History' },
      ]}
    />
  );
}

export function CollectionScreen({ userId }: CollectionScreenProps) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [data, setData] = useState<CollectionData | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const { unitPref } = usePreferences();

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

  const { counted, completion } = countCollection(exercises, data);
  const cardioCards = cardioRecordCards(
    data.cardioRecords,
    exercises.filter((exercise): exercise is CardioExercise => exercise.modality === 'cardio'),
    unitPref,
  );

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
    const pinned = data.pinnedExerciseIds;
    const from = pinned.indexOf(exercise.id);
    const to = from + offset;
    if (from < 0 || to < 0 || to >= pinned.length) return;
    try {
      await reorderPins(moved(pinned, from, offset));
      reload();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not reorder pins.');
    }
  };

  const pinIndex = (exercise: Exercise) => data.pinnedExerciseIds.indexOf(exercise.id);

  const completionPercent = Math.round(completion.fraction * 100);

  return (
    <main className="screen stack">
      <h1 className="title">Collection log</h1>
      <CollectionTabs />
      <div className="panel stack">
        <div className="row spread">
          <span>Completion</span>
          <strong className="pixel accent-text" data-testid="collection-completion">
            {completionPercent}% ({completion.filledSlots}/{completion.totalSlots})
          </strong>
        </div>
        <div className="meter" role="img" aria-label={`${completionPercent}% of slots filled`}>
          <div className="meter-fill" style={{ width: `${completionPercent}%` }} />
        </div>
        <span className="muted tiny">Counts exercises you've done or pinned.</span>
      </div>
      <ExercisePicker
        exercises={exercises.filter(
          (exercise) =>
            exercise.modality === 'lift' && !exercise.archived && !data.pinnedExerciseIds.includes(exercise.id),
        )}
        placeholder="Pin an exercise you want to chase…"
        onPick={(exercise) => togglePin(exercise)}
      />
      <div className="slot-legend">
        <span>
          <span className="swatch filled" />
          Exact rep max
        </span>
        <span>
          <span className="swatch" />
          Beaten by a higher-rep set
        </span>
      </div>
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
      {cardioCards.length > 0 && (
        <section className="panel stack" aria-labelledby="cardio-records-heading" data-testid="cardio-records">
          <h2 id="cardio-records-heading">Cardio records</h2>
          <span className="muted tiny">Only you can see these.</span>
          <ul className="stored-set-list">
            {cardioCards.map((card) => (
              <li key={card.exerciseId} className="stack" style={{ gap: 2 }}>
                <strong>{card.name}</strong>
                <span>{card.lines.join(' · ')}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
