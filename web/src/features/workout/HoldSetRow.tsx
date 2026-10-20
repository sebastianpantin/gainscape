import type { Ref } from 'react';
import { HOLD_BOUNDS } from '@domain/types.ts';
import { NumberTextField } from '../../components/NumberTextField.tsx';
import type { HoldMeasure, LoadType } from '../../lib/exercises/catalog-rules.ts';
import type { HoldValues } from '../../lib/workout/exercise-edit-rules.ts';
import type { UnitPref } from '../../lib/profile/profile.ts';
import type { HoldDraftSet } from '../../offline/draft-format.ts';
import { EffortSelector } from './EffortSelector.tsx';
import { DoneToggle } from './DoneToggle.tsx';
import { SetMenu } from './SetMenu.tsx';
import { WeightField } from './SetRow.tsx';
import { type PreviewRecord } from './record-preview.ts';
import { RecordChip } from './RecordChip.tsx';
import type { ShownSetDrop } from './set-feedback-rules.ts';
import { previewXpLabel, type SetPreview } from './xp-preview.ts';

interface HoldFieldsProps {
  set: HoldValues;
  measure: HoldMeasure;
  loadType: LoadType;
  unit: UnitPref;
  setNumber: number;
  onChange: (changes: Partial<HoldValues>) => void;
}

export function HoldFields({ set, measure, loadType, unit, setNumber, onChange }: HoldFieldsProps) {
  return (
    <>
      <WeightField
        loadType={loadType}
        weightKg={set.weightKg}
        unit={unit}
        onChange={(weightKg) => onChange({ weightKg })}
        setNumber={setNumber}
      />
      {measure === 'time' ? (
        <NumberTextField
          label="s"
          accessibleName={`Seconds, set ${setNumber}`}
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
          accessibleName={`Metres, set ${setNumber}`}
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
      <HoldFields
        set={set}
        measure={measure}
        loadType={loadType}
        unit={unit}
        setNumber={setNumber}
        onChange={onChange}
      />
      <span className={set.done ? 'set-xp earned' : 'set-xp'}>
        {previewXpLabel(preview)}
        {record && <RecordChip record={record} pulsing={drop?.record === true} />}
      </span>
      <DoneToggle done={set.done} label={`Done set ${setNumber}`} drop={drop} onToggle={onToggleDone} />
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
