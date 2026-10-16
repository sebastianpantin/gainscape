import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { announceDataChange } from '../../lib/query/data-changes.ts';
import { type CardioRecordCard, cardioRecordCards, holdRecordCards } from '../../lib/workout/cardio-rules.ts';
import { type Exercise, isCardioExercise, isLiftExercise } from '../../lib/exercises/catalog-rules.ts';
import { usePreferences } from '../../lib/profile/preferences.ts';
import { collectionPercent, countCollection } from '../../lib/collection/collection-rules.ts';
import { moved } from '../../lib/reorder.ts';
import { pinExercise, reorderPins, unpinExercise } from '../../lib/collection/collection-data.ts';
import { collectionQuery } from '../../lib/query/queries.ts';
import { cacheFirstNotice } from '../../offline/cache-first.ts';
import { OFFLINE_COLLECTION_NOTICE } from '../../offline/collection-cache.ts';
import { EmptyState } from '../../components/EmptyState.tsx';
import { ScreenProblem } from '../../components/ScreenProblem.tsx';
import { ScreenSkeleton } from '../../components/ScreenSkeleton.tsx';
import { SegmentedNav } from '../../components/SegmentedNav.tsx';
import { ExercisePicker } from '../workout/ExercisePicker.tsx';
import { ExerciseRecordCard } from './ExerciseRecordCard.tsx';
import { messageOf } from '../../lib/error-text.ts';
import { loadedState } from '../../lib/query/query-state-rules.ts';
import { CollectionHeading } from './CollectionHeading.tsx';

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
  const collection = useQuery(collectionQuery(userId));
  const queryClient = useQueryClient();
  const [problem, setProblem] = useState<string | null>(null);
  const { unitPref } = usePreferences();

  const loaded = loadedState(collection.data, collection.error);
  if (loaded.status === 'failed')
    return (
      <ScreenProblem
        heading={<CollectionHeading tab="Records" />}
        problem={loaded.problem}
        onRetry={collection.refetch}
      >
        <CollectionTabs />
      </ScreenProblem>
    );
  if (loaded.status !== 'ready') return <ScreenSkeleton title="Collection" />;

  const { exercises, data } = loaded.data.loaded;
  const savedNotice = cacheFirstNotice(loaded.data, OFFLINE_COLLECTION_NOTICE);
  const reloadPins = async () => {
    void announceDataChange(queryClient, 'pins-changed');
    const result = await collection.refetch();
    if (result.isError) setProblem(result.error.message);
  };
  const { counted, completion } = countCollection(exercises, data);
  const cardioCards = cardioRecordCards(data.cardioRecords, exercises.filter(isCardioExercise), unitPref);
  const holdCards = holdRecordCards(data.cardioRecords, exercises.filter(isLiftExercise));

  const togglePin = async (exercise: Exercise) => {
    setProblem(null);
    try {
      if (data.pinnedExerciseIds.includes(exercise.id)) await unpinExercise(exercise.id);
      else await pinExercise(exercise.id, data.nextPinPosition);
      await reloadPins();
    } catch (error) {
      setProblem(messageOf(error, 'Could not update pins.'));
    }
  };

  const movePin = async (exercise: Exercise, offset: -1 | 1) => {
    const pinned = data.pinnedExerciseIds;
    const from = pinned.indexOf(exercise.id);
    const to = from + offset;
    if (from < 0 || to < 0 || to >= pinned.length) return;
    setProblem(null);
    try {
      await reorderPins(moved(pinned, from, offset));
      await reloadPins();
    } catch (error) {
      setProblem(messageOf(error, 'Could not reorder pins.'));
    }
  };

  const pinIndex = (exercise: Exercise) => data.pinnedExerciseIds.indexOf(exercise.id);

  const completionPercent = collectionPercent(completion.filledSlots, completion.totalSlots);

  return (
    <main className="screen stack">
      <CollectionHeading tab="Records" />
      <CollectionTabs />
      {problem && (
        <p className="problem" role="alert">
          {problem}
        </p>
      )}
      {savedNotice && (
        <p className="notice" role="status">
          {savedNotice}
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
        <EmptyState text="Log a workout or pin an exercise to start your collection." startLabel="Start a workout" />
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
      <TimedRecordSection id="cardio-records-heading" title="Cardio records" cards={cardioCards} />
      <TimedRecordSection id="hold-records-heading" title="Hold records" cards={holdCards} />
    </main>
  );
}

interface TimedRecordSectionProps {
  id: string;
  title: string;
  cards: readonly CardioRecordCard[];
}

function TimedRecordSection({ id, title, cards }: TimedRecordSectionProps) {
  if (cards.length === 0) return null;
  return (
    <section className="panel stack" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      <span className="muted tiny">Only you can see these.</span>
      <ul className="stored-set-list">
        {cards.map((card) => (
          <li key={card.exerciseId} className="stack" style={{ gap: 2 }}>
            <strong>{card.name}</strong>
            <span>{card.lines.join(' · ')}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
