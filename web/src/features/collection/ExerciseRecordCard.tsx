import { exerciseLabels, type LiftExercise } from '../../lib/catalog-rules.ts';
import type { CollectionData } from '../../lib/collection-data.ts';
import { emptySlots, strengthText } from '../../lib/collection-rules.ts';
import { usePreferences } from '../../lib/preferences.ts';
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
    <section className="panel stack" data-testid={`collection-${exercise.id}`}>
      <header className="row spread">
        <span className="stack" style={{ gap: 2 }}>
          <h2>{exercise.name}</h2>
          {exerciseLabels(exercise) && <span className="muted">{exerciseLabels(exercise)}</span>}
        </span>
        <div className="row">
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
