import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { cardioRecordCards } from '../../lib/cardio-rules.ts';
import { type Exercise, isCardioExercise } from '../../lib/catalog-rules.ts';
import { usePreferences } from '../../lib/preferences.ts';
import { collectionPercent, countCollection } from '../../lib/collection-rules.ts';
import { moved } from '../../lib/reorder.ts';
import { loadCollectionCacheFirst, pinExercise, reorderPins, unpinExercise } from '../../lib/collection-data.ts';
import { OFFLINE_COLLECTION_NOTICE } from '../../offline/collection-cache.ts';
import { ScreenSkeleton } from '../../components/ScreenSkeleton.tsx';
import { SegmentedNav } from '../../components/SegmentedNav.tsx';
import { ExercisePicker } from '../workout/ExercisePicker.tsx';
import { ExerciseRecordCard } from './ExerciseRecordCard.tsx';
import { messageOf } from '../../lib/error-text.ts';
import { loadedState } from '../../lib/query-state-rules.ts';

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
  const collection = useQuery({
    queryKey: ['collection', userId],
    queryFn: () => loadCollectionCacheFirst(userId),
  });
  const [problem, setProblem] = useState<string | null>(null);
  const { unitPref } = usePreferences();

  const loaded = loadedState(collection.data, collection.error);
  const shownProblem = problem ?? (loaded.status === 'failed' ? loaded.problem : null);
  if (shownProblem)
    return (
      <main className="screen">
        <p className="problem" role="alert">
          {shownProblem}
        </p>
      </main>
    );
  if (loaded.status !== 'ready') return <ScreenSkeleton title="Collection log" />;

  const {
    loaded: { exercises, data },
    fromCache,
  } = loaded.data;
  const reload = async () => {
    const result = await collection.refetch();
    if (result.isError) setProblem(result.error.message);
  };
  const { counted, completion } = countCollection(exercises, data);
  const cardioCards = cardioRecordCards(data.cardioRecords, exercises.filter(isCardioExercise), unitPref);

  const togglePin = async (exercise: Exercise) => {
    try {
      if (data.pinnedExerciseIds.includes(exercise.id)) await unpinExercise(exercise.id);
      else await pinExercise(exercise.id, data.nextPinPosition);
      await reload();
    } catch (error) {
      setProblem(messageOf(error, 'Could not update pins.'));
    }
  };

  const movePin = async (exercise: Exercise, offset: -1 | 1) => {
    const pinned = data.pinnedExerciseIds;
    const from = pinned.indexOf(exercise.id);
    const to = from + offset;
    if (from < 0 || to < 0 || to >= pinned.length) return;
    try {
      await reorderPins(moved(pinned, from, offset));
      await reload();
    } catch (error) {
      setProblem(messageOf(error, 'Could not reorder pins.'));
    }
  };

  const pinIndex = (exercise: Exercise) => data.pinnedExerciseIds.indexOf(exercise.id);

  const completionPercent = collectionPercent(completion.filledSlots, completion.totalSlots);

  return (
    <main className="screen stack">
      <h1 className="title">Collection log</h1>
      <CollectionTabs />
      {fromCache && (
        <p className="notice" role="status">
          {OFFLINE_COLLECTION_NOTICE}
        </p>
      )}
      <div className="panel stack">
        <dl className="row spread">
          <dt>Completion</dt>
          <dd className="pixel accent-text">
            <strong>
              {completionPercent}% ({completion.filledSlots}/{completion.totalSlots})
            </strong>
          </dd>
        </dl>
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
        <section className="panel stack" aria-labelledby="cardio-records-heading">
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
