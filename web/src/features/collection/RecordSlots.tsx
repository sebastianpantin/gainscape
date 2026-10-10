import { measuresRepsCapacity } from '@domain/types.ts';
import type { LoadType } from '../../lib/catalog-rules.ts';
import type { UnitPref } from '../../lib/profile-rules.ts';
import { slotClass, slotLabel, slotText } from './record-slots.ts';

interface RecordSlotsProps {
  loadType: LoadType;
  slots: readonly ({ loadKg: number | null; exact: boolean } | null)[];
  maxReps: number | null | undefined;
  unit: UnitPref;
  weightsHidden?: boolean;
}

export function RecordSlots({ loadType, slots, maxReps, unit, weightsHidden = false }: RecordSlotsProps) {
  if (measuresRepsCapacity(loadType)) {
    return (
      <p className={maxReps ? 'record-slot bodyweight-record filled' : 'record-slot bodyweight-record'}>
        Max reps: <strong>{maxReps ?? '—'}</strong>
      </p>
    );
  }
  return (
    <ol className="record-slots" aria-label="Rep maxes">
      {slots.map((slot, index) => (
        <li
          key={index}
          className={slotClass(slot)}
          aria-label={slotLabel(index + 1, slot, loadType, unit, weightsHidden)}
        >
          <span className="muted">{index + 1}RM</span> <span>{slotText(slot, loadType, unit, weightsHidden)}</span>
        </li>
      ))}
    </ol>
  );
}
