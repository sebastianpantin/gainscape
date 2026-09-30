import { REP_MAX_SLOT_COUNT } from '@domain/types.ts';
import type { Exercise } from '../../lib/catalog.ts';
import type { CollectionData } from '../../lib/collection-data.ts';
import { formatLoad } from '../../lib/format.ts';

interface ExerciseRecordCardProps {
  exercise: Exercise;
  data: CollectionData;
  pinned: boolean;
  onTogglePin: () => void;
}

function StrengthLine({ exercise, data }: { exercise: Exercise; data: CollectionData }) {
  const strength = data.strengthByExercise.get(exercise.id);
  if (!strength) return null;
  if (strength.repsCapacity !== null) return <span className="muted">Capacity ~{strength.repsCapacity} reps</span>;
  if (strength.e1rmKg !== null) return <span className="muted">e1RM {strength.e1rmKg.toFixed(1)} kg</span>;
  return null;
}

export function ExerciseRecordCard({ exercise, data, pinned, onTogglePin }: ExerciseRecordCardProps) {
  const slots = data.repMaxesByExercise.get(exercise.id) ?? Array.from({ length: REP_MAX_SLOT_COUNT }, () => null);
  const maxReps = data.maxRepsByExercise.get(exercise.id);

  return (
    <section className="panel stack" data-testid={`collection-${exercise.id}`}>
      <header className="row spread">
        <h2>{exercise.name}</h2>
        <button type="button" className="button link" onClick={onTogglePin}>
          {pinned ? 'Unpin' : 'Pin'}
        </button>
      </header>
      <StrengthLine exercise={exercise} data={data} />
      {exercise.loadType === 'bodyweight' ? (
        <p className={maxReps ? 'record-slot filled' : 'record-slot'}>Max reps: {maxReps ?? '—'}</p>
      ) : (
        <ol className="record-slots">
          {slots.map((slot, index) => (
            <li key={index} className={slot?.exact ? 'record-slot filled' : 'record-slot'}>
              <span className="muted">{index + 1}RM</span> {slot ? formatLoad(slot.loadKg, exercise.loadType) : '—'}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
