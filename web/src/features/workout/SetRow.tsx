import type { EffortLevel } from '@domain/types.ts';
import type { LoadType } from '../../lib/catalog.ts';
import type { DraftSet } from '../../offline/draft-format.ts';
import { EffortSelector } from './EffortSelector.tsx';

interface SetRowProps {
  setNumber: number;
  loadType: LoadType;
  set: DraftSet;
  onChange: (changes: Partial<Omit<DraftSet, 'id'>>) => void;
  onRemove: () => void;
}

function clampedNumber(raw: string, fallback: number, lowest: number, highest: number): number {
  const value = Number(raw);
  if (raw.trim() === '' || !Number.isFinite(value)) return fallback;
  return Math.min(highest, Math.max(lowest, value));
}

interface WeightFieldProps {
  loadType: LoadType;
  weightKg: number;
  onChange: (weightKg: number) => void;
}

function WeightField({ loadType, weightKg, onChange }: WeightFieldProps) {
  if (loadType === 'bodyweight') return <span className="compact-field muted">bodyweight</span>;
  return (
    <label className="compact-field">
      {loadType === 'bodyweight_plus' ? '+kg' : 'kg'}
      <input
        type="number"
        inputMode="decimal"
        min={0}
        max={2000}
        step={0.5}
        value={weightKg}
        onChange={(event) => onChange(clampedNumber(event.target.value, weightKg, 0, 2000))}
      />
    </label>
  );
}

export function SetRow({ setNumber, loadType, set, onChange, onRemove }: SetRowProps) {
  return (
    <li className="set-row">
      <span className="set-number">{setNumber}</span>
      <WeightField loadType={loadType} weightKg={set.weightKg} onChange={(weightKg) => onChange({ weightKg })} />
      <label className="compact-field">
        reps
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={100}
          step={1}
          value={set.reps}
          onChange={(event) => onChange({ reps: Math.round(clampedNumber(event.target.value, set.reps, 1, 100)) })}
        />
      </label>
      <button type="button" className="button icon" aria-label={`Remove set ${setNumber}`} onClick={onRemove}>
        ✕
      </button>
      <EffortSelector
        selected={set.effortLevel}
        onSelect={(effortLevel: EffortLevel | null) => onChange({ effortLevel })}
      />
    </li>
  );
}
