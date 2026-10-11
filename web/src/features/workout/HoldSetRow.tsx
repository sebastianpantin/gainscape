import { HOLD_BOUNDS } from '@domain/types.ts';
import { Icon } from '../../components/Icon.tsx';
import { NumberTextField } from '../../components/NumberTextField.tsx';
import type { LoadType } from '../../lib/catalog-rules.ts';
import type { UnitPref } from '../../lib/profile.ts';
import type { HoldDraftSet, HoldMeasure, HoldValues } from '../../offline/draft-format.ts';
import { EffortSelector } from './EffortSelector.tsx';
import { WeightField } from './SetRow.tsx';
import { type PreviewRecord, recordChipLabel, recordChipText } from './record-preview.ts';
import { previewXpLabel, type SetPreview } from './xp-preview.ts';

interface HoldFieldsProps {
  set: HoldValues;
  measure: HoldMeasure;
  loadType: LoadType;
  unit: UnitPref;
  onChange: (changes: Partial<HoldValues>) => void;
}

export function HoldFields({ set, measure, loadType, unit, onChange }: HoldFieldsProps) {
  return (
    <>
      <WeightField
        loadType={loadType}
        weightKg={set.weightKg}
        unit={unit}
        onChange={(weightKg) => onChange({ weightKg })}
      />
      {measure === 'time' ? (
        <NumberTextField
          label="s"
          accessibleName="Seconds"
          value={set.durationS ?? HOLD_BOUNDS.durationS.min}
          lowest={HOLD_BOUNDS.durationS.min}
          highest={HOLD_BOUNDS.durationS.max}
          wholeNumber
          step={5}
          onCommit={(durationS) => onChange({ durationS })}
        />
      ) : (
        <NumberTextField
          label="m"
          accessibleName="Metres"
          value={set.distanceM ?? HOLD_BOUNDS.distanceM.min}
          lowest={HOLD_BOUNDS.distanceM.min}
          highest={HOLD_BOUNDS.distanceM.max}
          step={5}
          onCommit={(distanceM) => onChange({ distanceM })}
        />
      )}
    </>
  );
}

interface HoldSetRowProps {
  setNumber: number;
  set: HoldDraftSet;
  measure: HoldMeasure;
  loadType: LoadType;
  preview: SetPreview;
  record: PreviewRecord | null;
  unit: UnitPref;
  onChange: (changes: Partial<Omit<HoldDraftSet, 'id' | 'kind'>>) => void;
  onRemove: () => void;
  onToggleDone: () => void;
}

export function HoldSetRow({
  setNumber,
  set,
  measure,
  loadType,
  preview,
  record,
  unit,
  onChange,
  onRemove,
  onToggleDone,
}: HoldSetRowProps) {
  return (
    <li className={set.done ? 'set-row hold-row' : 'set-row hold-row planned'} aria-label={`Set ${setNumber}`}>
      <span className="set-number">{setNumber}</span>
      <HoldFields set={set} measure={measure} loadType={loadType} unit={unit} onChange={onChange} />
      <span className={set.done ? 'set-xp earned' : 'set-xp'}>
        {previewXpLabel(preview)}
        {record && (
          <span className="record-chip" role="img" aria-label={recordChipLabel(record)}>
            {recordChipText(record)}
          </span>
        )}
      </span>
      <button
        type="button"
        className={`button done-toggle ${set.done ? 'selected' : ''}`}
        aria-pressed={set.done}
        aria-label={`Done set ${setNumber}`}
        onClick={onToggleDone}
      >
        <Icon name="check" size={20} strokeWidth={3} />
      </button>
      <button type="button" className="button icon" aria-label={`Remove set ${setNumber}`} onClick={onRemove}>
        ✕
      </button>
      <EffortSelector
        mode="level"
        selected={set.effort}
        onSelect={(effort) => onChange(effort === null ? { effort } : { effort, done: true })}
      />
    </li>
  );
}
