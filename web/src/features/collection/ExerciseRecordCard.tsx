import { REP_MAX_SLOT_COUNT } from '@domain/types.ts';
import { type Exercise, exerciseLabels } from '../../lib/catalog.ts';
import type { CollectionData, RepMaxSlotView } from '../../lib/collection-data.ts';
import { formatLoad } from '../../lib/format.ts';
import { usePreferences } from '../../lib/preferences.ts';
import { formatWeight } from '../../lib/units.ts';

interface ExerciseRecordCardProps {
  exercise: Exercise;
  data: CollectionData;
  pinned: boolean;
  onTogglePin: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

function slotClass(slot: RepMaxSlotView | null): string {
  if (!slot) return 'record-slot empty';
  return slot.exact ? 'record-slot filled' : 'record-slot';
}

function StrengthLine({ exercise, data }: { exercise: Exercise; data: CollectionData }) {
  const { unitPref } = usePreferences();
  const strength = data.strengthByExercise.get(exercise.id);
  if (!strength) return null;
  if (strength.repsCapacity !== null) return <span className="muted">Capacity ~{strength.repsCapacity} reps</span>;
  if (strength.e1rmKg !== null) return <span className="muted">e1RM {formatWeight(strength.e1rmKg, unitPref)}</span>;
  return null;
}

export function ExerciseRecordCard({
  exercise,
  data,
  pinned,
  onTogglePin,
  onMoveUp,
  onMoveDown,
}: ExerciseRecordCardProps) {
  const slots = data.repMaxesByExercise.get(exercise.id) ?? Array.from({ length: REP_MAX_SLOT_COUNT }, () => null);
  const maxReps = data.maxRepsByExercise.get(exercise.id);
  const { unitPref } = usePreferences();

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
      <StrengthLine exercise={exercise} data={data} />
      {exercise.loadType === 'bodyweight' ? (
        <p className={maxReps ? 'record-slot bodyweight-record filled' : 'record-slot bodyweight-record'}>
          Max reps: <strong>{maxReps ?? '—'}</strong>
        </p>
      ) : (
        <ol className="record-slots">
          {slots.map((slot, index) => (
            <li key={index} className={slotClass(slot)}>
              <span className="muted">{index + 1}RM</span>{' '}
              <span>{slot ? formatLoad(slot.loadKg, exercise.loadType, unitPref) : '—'}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
