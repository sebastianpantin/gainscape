import { exerciseLabels, type LiftExercise } from '../../lib/exercises/catalog-rules.ts';
import type { CollectionData } from '../../lib/collection/collection-data.ts';
import { emptySlots, strengthText } from '../../lib/collection/collection-rules.ts';
import { usePreferences } from '../../lib/profile/preferences.ts';
import { ExerciseProgressLink } from './ExerciseProgressLink.tsx';
import { RecordSlots } from './RecordSlots.tsx';

interface ExerciseRecordCardProps {
  exercise: LiftExercise;
  data: CollectionData;
  pinned: boolean;
  onTogglePin: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

export function ExerciseRecordCard({
  exercise,
  data,
  pinned,
  onTogglePin,
  onMoveUp,
  onMoveDown,
}: ExerciseRecordCardProps) {
  const slots = data.repMaxesByExercise.get(exercise.id) ?? emptySlots();
  const maxReps = data.maxRepsByExercise.get(exercise.id);
  const { unitPref } = usePreferences();
  const strengthLine = strengthText(data.strengthByExercise.get(exercise.id), exercise.loadType, unitPref);

  return (
    <section className="panel stack">
      <header className="row spread">
        <span className="stack" style={{ gap: 'var(--space-0-5)' }}>
          <h2>{exercise.name}</h2>
          {exerciseLabels(exercise) && <span className="muted">{exerciseLabels(exercise)}</span>}
        </span>
        <div className="row wrap">
          <ExerciseProgressLink exerciseId={exercise.id} exerciseName={exercise.name} />
          {pinned && (
            <>
              <button type="button" className="button link" onClick={onMoveUp} disabled={!onMoveUp}>
                Up
              </button>
              <button type="button" className="button link" onClick={onMoveDown} disabled={!onMoveDown}>
                Down
              </button>
            </>
          )}
          <button type="button" className="button link" onClick={onTogglePin}>
            {pinned ? 'Unpin' : 'Pin'}
          </button>
        </div>
      </header>
      {strengthLine && <span className="muted">{strengthLine}</span>}
      <RecordSlots loadType={exercise.loadType} slots={slots} maxReps={maxReps} unit={unitPref} />
    </section>
  );
}
