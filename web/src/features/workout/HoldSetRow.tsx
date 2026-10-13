import type { Ref } from 'react';
import { HOLD_BOUNDS } from '@domain/types.ts';
import { Icon } from '../../components/Icon.tsx';
import { NumberTextField } from '../../components/NumberTextField.tsx';
import type { HoldMeasure, LoadType } from '../../lib/exercises/catalog-rules.ts';
import type { HoldValues } from '../../lib/workout/exercise-edit-rules.ts';
import type { UnitPref } from '../../lib/profile/profile.ts';
import type { HoldDraftSet } from '../../offline/draft-format.ts';
import { EffortSelector } from './EffortSelector.tsx';
import { SetMenu } from './SetMenu.tsx';
import { WeightField } from './SetRow.tsx';
import { type PreviewRecord, recordChipLabel, recordChipText } from './record-preview.ts';
import type { ShownSetDrop } from './set-feedback-rules.ts';
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
          lastInGroup
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
          lastInGroup
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
  drop: ShownSetDrop | null;
  unit: UnitPref;
  onChange: (changes: Partial<Omit<HoldDraftSet, 'id' | 'kind'>>) => void;
  menuRef: Ref<HTMLButtonElement>;
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
  drop,
  unit,
  onChange,
  menuRef,
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
          <span
            className={drop?.record ? 'record-chip pulse' : 'record-chip'}
            role="img"
            aria-label={recordChipLabel(record)}
          >
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
      {drop?.xpText && (
        <span key={drop.key} className="xp-drop" aria-hidden="true">
          {drop.xpText}
        </span>
      )}
      <SetMenu
        buttonRef={menuRef}
        name={`Set ${setNumber} options`}
        actions={[{ label: 'Remove set', accessibleName: `Remove set ${setNumber}`, danger: true, onChoose: onRemove }]}
      />
      <EffortSelector
        mode="level"
        selected={set.effort}
        onSelect={(effort) => onChange(effort === null ? { effort } : { effort, done: true })}
      />
    </li>
  );
}
