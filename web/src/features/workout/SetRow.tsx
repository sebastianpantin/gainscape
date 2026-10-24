import { type ReactNode, type Ref, useEffect, useId, useRef, useState } from 'react';
import { DEFAULT_BALANCE, MAX_SET_LOAD_KG } from '@domain/index.ts';
import { NumberTextField } from '../../components/NumberTextField.tsx';
import type { LoadType } from '../../lib/exercises/catalog-rules.ts';
import { assumedEffort } from '../../lib/workout/effort-labels.ts';
import { GLOSSARY } from '../../lib/ui/glossary.ts';
import type { EffortInputMode, UnitPref } from '../../lib/profile/profile.ts';
import {
  HIGHEST_REPS,
  highestWeightInUnit,
  LOWEST_REPS,
  shownWeight,
  type StepDirection,
  steppedWeight,
  unitToKg,
  WEIGHT_STEPPER_STEP,
} from '../../lib/units.ts';
import { amrapBadgeOf } from '../../lib/programs/program-today-rules.ts';
import type { DraftBarbellSetup } from '../../lib/programs/program-set-rules.ts';
import type { DraftSet } from '../../offline/draft-format.ts';
import type { LastLoggedSet } from '../../offline/draft-edits.ts';
import { EffortSelector } from './EffortSelector.tsx';
import { DoneToggle } from './DoneToggle.tsx';
import { lastSetChangesFor, lastSetDelta, lastSetName, lastSetText } from './last-set-rules.ts';
import { PlateCalculator } from './PlateCalculator.tsx';
import { PlateChips } from './PlateChips.tsx';
import { SetMenu } from './SetMenu.tsx';
import { type PreviewRecord } from './record-preview.ts';
import { RecordChip } from './RecordChip.tsx';
import type { ShownSetDrop } from './set-feedback-rules.ts';
import { previewNote, previewXpLabel, type SetPreview } from './xp-preview.ts';

interface SetRowProps {
  setNumber: number;
  loadType: LoadType;
  set: DraftSet;
  preview: SetPreview;
  record: PreviewRecord | null;
  drop: ShownSetDrop | null;
  unit: UnitPref;
  effortMode: EffortInputMode;
  markers: readonly string[];
  barbell: { plates: number[]; text: string; setup: DraftBarbellSetup } | null;
  last: LastLoggedSet | null;
  onChange: (changes: Partial<Omit<DraftSet, 'id'>>) => void;
  menuRef: Ref<HTMLButtonElement>;
  onRemove: () => void;
  onToggleDone: () => void;
  doneLabel?: string;
  rowLabel?: string;
  current: boolean;
  focusDone: boolean;
  onDoneFocused: () => void;
}

interface StepperProps {
  className: string;
  lowerLabel: string;
  higherLabel: string;
  onStep: (direction: StepDirection) => void;
  children: ReactNode;
}

function Stepper({ className, lowerLabel, higherLabel, onStep, children }: StepperProps) {
  return (
    <div className={`stepper-field ${className}`}>
      <button type="button" className="button icon" aria-label={lowerLabel} onClick={() => onStep(-1)}>
        −
      </button>
      {children}
      <button type="button" className="button icon" aria-label={higherLabel} onClick={() => onStep(1)}>
        +
      </button>
    </div>
  );
}

interface WeightFieldProps {
  loadType: LoadType;
  weightKg: number;
  unit: UnitPref;
  onChange: (weightKg: number) => void;
  setNumber: number;
  withStepper?: boolean;
}

export function WeightField({ loadType, weightKg, unit, onChange, setNumber, withStepper = false }: WeightFieldProps) {
  if (loadType === 'bodyweight') return <span className="compact-field set-number weight-field">bodyweight</span>;
  const shown = shownWeight(weightKg, unit);
  const highest = highestWeightInUnit(MAX_SET_LOAD_KG, unit);
  const field = (
    <NumberTextField
      label={loadType === 'bodyweight_plus' ? `+${unit}` : unit}
      accessibleName={`${loadType === 'bodyweight_plus' ? 'Added weight' : 'Weight'} in ${unit}, set ${setNumber}`}
      value={shown}
      lowest={0}
      highest={highest}
      step={WEIGHT_STEPPER_STEP[unit]}
      onCommit={(typed) => onChange(unitToKg(typed, unit))}
    />
  );
  if (!withStepper) return field;
  return (
    <Stepper
      className="weight-field"
      lowerLabel={`Lighter, set ${setNumber}`}
      higherLabel={`Heavier, set ${setNumber}`}
      onStep={(direction) => onChange(unitToKg(steppedWeight(shown, unit, direction, highest), unit))}
    >
      {field}
    </Stepper>
  );
}

interface RepsFieldProps {
  reps: number;
  onChange: (reps: number) => void;
  setNumber: number;
}

export function RepsField({ reps, onChange, setNumber }: RepsFieldProps) {
  return (
    <NumberTextField
      label="reps"
      accessibleName={`Reps, set ${setNumber}`}
      value={reps}
      lowest={LOWEST_REPS}
      highest={HIGHEST_REPS}
      wholeNumber
      lastInGroup
      onCommit={onChange}
    />
  );
}

interface LastSetProps {
  last: LastLoggedSet;
  set: DraftSet;
  loadType: LoadType;
  unit: UnitPref;
  setNumber: number;
  onChange: (changes: Partial<Omit<DraftSet, 'id'>>) => void;
}

function LastSet({ last, set, loadType, unit, setNumber, onChange }: LastSetProps) {
  if (set.done) {
    const delta = lastSetDelta(set, last, loadType, unit);
    return (
      <span className={`last-delta ${delta.direction}`} role="img" aria-label={delta.label}>
        {delta.text}
      </span>
    );
  }
  return (
    <button
      type="button"
      className="last-set"
      aria-label={lastSetName(last, loadType, unit, setNumber)}
      onClick={() => onChange(lastSetChangesFor(last, loadType))}
    >
      <span className="last-set-chip">{lastSetText(last, loadType, unit)}</span>
    </button>
  );
}

export function SetRow({
  setNumber,
  loadType,
  set,
  preview,
  record,
  drop,
  unit,
  effortMode,
  markers,
  barbell,
  last,
  onChange,
  menuRef,
  onRemove,
  onToggleDone,
  doneLabel = `Done set ${setNumber}`,
  rowLabel = `Set ${setNumber}`,
  current,
  focusDone,
  onDoneFocused,
}: SetRowProps) {
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const doneButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!focusDone) return;
    doneButton.current?.focus();
    onDoneFocused();
  }, [focusDone, onDoneFocused]);
  const calculatorId = useId();
  const amrapBadge = amrapBadgeOf(set.prescription);
  const marked = markers.length > 0 || barbell !== null;
  const estimatedRir = preview.basis === 'estimated' ? preview.rir : null;
  const rowClass = [
    'set-row',
    'stepped',
    set.done ? null : 'planned',
    current ? 'current' : null,
    set.isWarmup ? 'warmup' : null,
    barbell !== null && calculatorOpen ? 'calculating' : null,
  ]
    .filter((name) => name !== null)
    .join(' ');
  return (
    <li className={rowClass} aria-label={rowLabel} aria-current={current ? 'step' : undefined}>
      <span className="set-number">
        {setNumber}
        {amrapBadge && (
          <span className="amrap-badge" role="img" aria-label={`${amrapBadge}, ${GLOSSARY.amrap.name.toLowerCase()}`}>
            {amrapBadge}
          </span>
        )}
        {set.isWarmup && (
          <span className="warmup-badge" role="img" aria-label="Warm-up">
            W
          </span>
        )}
      </span>
      <WeightField
        loadType={loadType}
        weightKg={set.weightKg}
        unit={unit}
        onChange={(weightKg) => onChange({ weightKg })}
        setNumber={setNumber}
        withStepper
      />
      <div className="reps-field">
        <RepsField reps={set.reps} onChange={(reps) => onChange({ reps })} setNumber={setNumber} />
      </div>
      <DoneToggle done={set.done} label={doneLabel} drop={drop} onToggle={onToggleDone} buttonRef={doneButton} />
      <div className="set-info">
        {marked && (
          <span className="set-markers">
            {markers.map((text) => (
              <span key={text}>{text}</span>
            ))}
            {barbell !== null && (
              <button
                type="button"
                className="plate-marker"
                aria-expanded={calculatorOpen}
                aria-controls={calculatorId}
                aria-label={`${barbell.text}, plate calculator, set ${setNumber}`}
                onClick={() => setCalculatorOpen((open) => !open)}
              >
                <PlateChips plates={barbell.plates} unit={unit} />
                <span className="plate-text">{barbell.text}</span>
                <span className="plate-toggle" aria-hidden="true">
                  {calculatorOpen ? '▴' : '▾'}
                </span>
              </button>
            )}
          </span>
        )}
        {last !== null && (
          <LastSet last={last} set={set} loadType={loadType} unit={unit} setNumber={setNumber} onChange={onChange} />
        )}
        <span className={set.done ? 'set-xp earned' : 'set-xp'}>
          <span className="set-xp-line">
            {previewXpLabel(preview)}
            {record && <RecordChip record={record} pulsing={drop?.record === true} />}
          </span>
          <span className="tiny">{previewNote(preview)}</span>
        </span>
      </div>
      {barbell !== null && calculatorOpen && (
        <PlateCalculator
          id={calculatorId}
          setNumber={setNumber}
          setup={barbell.setup}
          highestLoadKg={MAX_SET_LOAD_KG}
          unit={unit}
          weightKg={set.weightKg}
          onUse={(weightKg) => onChange({ weightKg })}
        />
      )}
      <EffortSelector
        mode={effortMode}
        selected={set.effort}
        assumed={estimatedRir === null ? null : assumedEffort(effortMode, estimatedRir, DEFAULT_BALANCE.effortLevelRir)}
        onSelect={(effort) => onChange({ effort })}
      />
      <SetMenu
        buttonRef={menuRef}
        name={`${rowLabel} options`}
        actions={[
          {
            label: 'Warm-up',
            accessibleName: `Warm-up set ${setNumber}`,
            pressed: set.isWarmup,
            onChoose: () => onChange({ isWarmup: !set.isWarmup }),
          },
          { label: 'Remove set', accessibleName: `Remove set ${setNumber}`, danger: true, onChoose: onRemove },
        ]}
      />
    </li>
  );
}
