import type { HoldMeasure, LoadType, PaceUnit } from '../../lib/exercises/catalog-rules.ts';
import type { EffortInputMode, UnitPref } from '../../lib/profile/profile.ts';
import type { BoutValues, HoldValues } from '../../lib/workout/exercise-edit-rules.ts';
import { BoutFields, BoutModeToggle } from '../workout/BoutFields.tsx';
import { CardioEffortSelector } from '../workout/CardioEffortSelector.tsx';
import { EffortSelector } from '../workout/EffortSelector.tsx';
import { RepsField, WeightField } from '../workout/SetRow.tsx';
import { HoldFields } from '../workout/HoldSetRow.tsx';
import type { BoutSet, HoldSet, LiftSet } from '../../lib/workout/exercise-edit-rules.ts';

interface HistorySetRowProps {
  setNumber: number;
  loadType: LoadType;
  set: LiftSet;
  xpLabel: string;
  xpNote: string;
  unit: UnitPref;
  effortMode: EffortInputMode;
  onChange: (changes: Partial<Omit<LiftSet, 'id'>>) => void;
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
    <li className={`set-row history-set-row${set.isWarmup ? ' warmup' : ''}`} aria-label={`Set ${setNumber}`}>
      <span className="set-number">{setNumber}</span>
      <WeightField
        loadType={loadType}
        weightKg={set.weightKg}
        unit={unit}
        onChange={(weightKg) => onChange({ weightKg })}
        setNumber={setNumber}
      />
      <RepsField reps={set.reps} onChange={(reps) => onChange({ reps })} setNumber={setNumber} />
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

interface HistoryBoutRowProps {
  boutNumber: number;
  bout: BoutSet;
  paceUnit: PaceUnit;
  tracksDistance: boolean;
  xpLabel: string;
  xpNote: string;
  unit: UnitPref;
  onChange: (changes: Partial<BoutValues>) => void;
  onRemove: () => void;
}

export function HistoryBoutRow({
  boutNumber,
  bout,
  paceUnit,
  tracksDistance,
  xpLabel,
  xpNote,
  unit,
  onChange,
  onRemove,
}: HistoryBoutRowProps) {
  return (
    <li className="set-row bout-row history-bout-row" aria-label={`Bout ${boutNumber}`}>
      <span className="set-number">{boutNumber}</span>
      <BoutFields bout={bout} paceUnit={paceUnit} tracksDistance={tracksDistance} unit={unit} onChange={onChange} />
      <span className="set-xp earned">
        {xpLabel}
        <span className="tiny">{xpNote}</span>
      </span>
      <BoutModeToggle boutNumber={boutNumber} bout={bout} onChange={onChange} />
      <button type="button" className="button icon" aria-label={`Remove bout ${boutNumber}`} onClick={onRemove}>
        ✕
      </button>
      <CardioEffortSelector selected={bout.effort} onSelect={(effort) => onChange({ effort })} />
    </li>
  );
}

interface HistoryHoldRowProps {
  setNumber: number;
  set: HoldSet;
  measure: HoldMeasure;
  loadType: LoadType;
  xpLabel: string;
  xpNote: string;
  unit: UnitPref;
  onChange: (changes: Partial<HoldValues>) => void;
  onRemove: () => void;
}

export function HistoryHoldRow({
  setNumber,
  set,
  measure,
  loadType,
  xpLabel,
  xpNote,
  unit,
  onChange,
  onRemove,
}: HistoryHoldRowProps) {
  return (
    <li className="set-row hold-row" aria-label={`Set ${setNumber}`}>
      <span className="set-number">{setNumber}</span>
      <HoldFields
        set={set}
        measure={measure}
        loadType={loadType}
        unit={unit}
        setNumber={setNumber}
        onChange={onChange}
      />
      <span className="set-xp earned">
        {xpLabel}
        <span className="tiny">{xpNote}</span>
      </span>
      <button type="button" className="button icon" aria-label={`Remove set ${setNumber}`} onClick={onRemove}>
        ✕
      </button>
      <EffortSelector mode="level" selected={set.effort} onSelect={(effort) => onChange({ effort })} />
    </li>
  );
}
