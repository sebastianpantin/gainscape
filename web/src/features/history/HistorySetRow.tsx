import type { HoldMeasure, LoadType, PaceUnit } from '../../lib/catalog-rules.ts';
import type { EffortInputMode, UnitPref } from '../../lib/profile.ts';
import type { BoutValues, HoldValues } from '../../lib/exercise-edit-rules.ts';
import { BoutFields, BoutModeToggle } from '../workout/BoutFields.tsx';
import { CardioEffortSelector } from '../workout/CardioEffortSelector.tsx';
import { EffortSelector } from '../workout/EffortSelector.tsx';
import { RepsField, WeightField } from '../workout/SetRow.tsx';
import { HoldFields } from '../workout/HoldSetRow.tsx';
import type { EditBout, EditHold, EditSet } from './session-edit.ts';

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
    <li className="set-row" aria-label={`Set ${setNumber}`}>
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

interface HistoryBoutRowProps {
  boutNumber: number;
  bout: EditBout;
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
  set: EditHold;
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
      <HoldFields set={set} measure={measure} loadType={loadType} unit={unit} onChange={onChange} />
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
