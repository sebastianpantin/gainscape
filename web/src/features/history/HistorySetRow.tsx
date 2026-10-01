import type { LoadType } from '../../lib/catalog.ts';
import type { EffortInputMode, UnitPref } from '../../lib/profile.ts';
import { EffortSelector } from '../workout/EffortSelector.tsx';
import { RepsField, WeightField } from '../workout/SetRow.tsx';
import type { EditSet } from './session-edit.ts';

interface HistorySetRowProps {
  setNumber: number;
  loadType: LoadType;
  set: EditSet;
  xpLabel: string;
  xpNote: string;
  unit: UnitPref;
  effortMode: EffortInputMode;
  onChange: (changes: Partial<Omit<EditSet, 'id'>>) => void;
  onRemove: () => void;
}

export function HistorySetRow({
  setNumber,
  loadType,
  set,
  xpLabel,
  xpNote,
  unit,
  effortMode,
  onChange,
  onRemove,
}: HistorySetRowProps) {
  return (
    <li className="set-row">
      <span className="set-number">{setNumber}</span>
      <WeightField
        loadType={loadType}
        weightKg={set.weightKg}
        unit={unit}
        onChange={(weightKg) => onChange({ weightKg })}
      />
      <RepsField reps={set.reps} onChange={(reps) => onChange({ reps })} />
      <span className="set-xp earned">
        {xpLabel}
        <span className="tiny">{xpNote}</span>
      </span>
      <button
        type="button"
        className={`button done-toggle ${set.isWarmup ? 'selected' : ''}`}
        aria-pressed={set.isWarmup}
        aria-label={`Warm-up set ${setNumber}`}
        onClick={() => onChange({ isWarmup: !set.isWarmup })}
      >
        W
      </button>
      <button type="button" className="button icon" aria-label={`Remove set ${setNumber}`} onClick={onRemove}>
        ✕
      </button>
      <EffortSelector mode={effortMode} selected={set.effort} onSelect={(effort) => onChange({ effort })} />
    </li>
  );
}
