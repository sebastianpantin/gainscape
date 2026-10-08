import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { DEFAULT_BALANCE, type SetPersonalRecord } from '@domain/index.ts';
import { Icon } from '../../components/Icon.tsx';
import type { LoadType } from '../../lib/catalog-rules.ts';
import { assumedEffort } from '../../lib/effort-labels.ts';
import type { EffortInputMode, UnitPref } from '../../lib/profile.ts';
import {
  HIGHEST_REPS,
  highestWeightInUnit,
  LOWEST_REPS,
  shownWeight,
  type StepDirection,
  steppedReps,
  steppedWeight,
  unitToKg,
  WEIGHT_INPUT_STEP,
} from '../../lib/units.ts';
import { amrapBadgeOf } from '../../lib/program-today-rules.ts';
import type { DraftBarbellSetup } from '../../lib/program-set-rules.ts';
import type { DraftSet } from '../../offline/draft-format.ts';
import { EffortSelector } from './EffortSelector.tsx';
import { PlateCalculator } from './PlateCalculator.tsx';
import { PlateChips } from './PlateChips.tsx';
import { recordChipLabel, recordChipText } from './record-preview.ts';
import { previewNote, previewXpLabel, type SetPreview } from './xp-preview.ts';

interface SetRowProps {
  setNumber: number;
  loadType: LoadType;
  set: DraftSet;
  preview: SetPreview;
  record: SetPersonalRecord | null;
  unit: UnitPref;
  effortMode: EffortInputMode;
  markers: readonly string[];
  barbell: { plates: number[]; text: string; setup: DraftBarbellSetup } | null;
  onChange: (changes: Partial<Omit<DraftSet, 'id'>>) => void;
  onRemove: () => void;
  onToggleDone: () => void;
  doneLabel?: string;
  focusDone?: boolean;
  onDoneFocused?: () => void;
}

function clampedNumber(raw: string, fallback: number, lowest: number, highest: number): number {
  const value = Number(raw);
  if (raw.trim() === '' || !Number.isFinite(value)) return fallback;
  return Math.min(highest, Math.max(lowest, value));
}

const HIGHEST_LOAD_KG = 2000;

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
  stepperSetNumber?: number;
}

export function WeightField({ loadType, weightKg, unit, onChange, stepperSetNumber }: WeightFieldProps) {
  if (loadType === 'bodyweight') return <span className="compact-field set-number weight-field">bodyweight</span>;
  const shown = shownWeight(weightKg, unit);
  const highest = highestWeightInUnit(HIGHEST_LOAD_KG, unit);
  const field = (
    <label className="compact-field">
      {loadType === 'bodyweight_plus' ? `+${unit}` : unit}
      <input
        type="number"
        inputMode="decimal"
        min={0}
        max={highest}
        step={WEIGHT_INPUT_STEP}
        value={shown}
        onChange={(event) => onChange(unitToKg(clampedNumber(event.target.value, shown, 0, highest), unit))}
      />
    </label>
  );
  if (stepperSetNumber === undefined) return field;
  return (
    <Stepper
      className="weight-field"
      lowerLabel={`Lighter, set ${stepperSetNumber}`}
      higherLabel={`Heavier, set ${stepperSetNumber}`}
      onStep={(direction) => onChange(unitToKg(steppedWeight(shown, unit, direction, highest), unit))}
    >
      {field}
    </Stepper>
  );
}

interface RepsFieldProps {
  reps: number;
  onChange: (reps: number) => void;
  stepperSetNumber?: number;
}

export function RepsField({ reps, onChange, stepperSetNumber }: RepsFieldProps) {
  const field = (
    <label className="compact-field">
      reps
      <input
        type="number"
        inputMode="numeric"
        min={LOWEST_REPS}
        max={HIGHEST_REPS}
        step={1}
        value={reps}
        onChange={(event) => onChange(Math.round(clampedNumber(event.target.value, reps, LOWEST_REPS, HIGHEST_REPS)))}
      />
    </label>
  );
  if (stepperSetNumber === undefined) return field;
  return (
    <Stepper
      className="reps-field"
      lowerLabel={`One rep fewer, set ${stepperSetNumber}`}
      higherLabel={`One more rep, set ${stepperSetNumber}`}
      onStep={(direction) => onChange(steppedReps(reps, direction))}
    >
      {field}
    </Stepper>
  );
}

export function SetRow({
  setNumber,
  loadType,
  set,
  preview,
  record,
  unit,
  effortMode,
  markers,
  barbell,
  onChange,
  onRemove,
  onToggleDone,
  doneLabel = `Done set ${setNumber}`,
  focusDone = false,
  onDoneFocused,
}: SetRowProps) {
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const doneButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!focusDone) return;
    doneButton.current?.focus();
    onDoneFocused?.();
  }, [focusDone, onDoneFocused]);
  const calculatorId = useId();
  const amrapBadge = amrapBadgeOf(set.prescription);
  const marked = markers.length > 0 || barbell !== null;
  const estimatedRir = preview.basis === 'estimated' ? preview.rir : null;
  const rowClass = [
    'set-row',
    'stepped',
    set.done ? null : 'planned',
    set.isWarmup ? 'warmup' : null,
    marked ? 'marked' : null,
    barbell !== null && calculatorOpen ? 'calculating' : null,
  ]
    .filter((name) => name !== null)
    .join(' ');
  return (
    <li className={rowClass}>
      <span className="set-number">
        {setNumber}
        {amrapBadge && <span className="amrap-badge">{amrapBadge}</span>}
      </span>
      <WeightField
        loadType={loadType}
        weightKg={set.weightKg}
        unit={unit}
        onChange={(weightKg) => onChange({ weightKg })}
        stepperSetNumber={setNumber}
      />
      <RepsField reps={set.reps} onChange={(reps) => onChange({ reps })} stepperSetNumber={setNumber} />
      <span className={set.done ? 'set-xp earned' : 'set-xp'}>
        {previewXpLabel(preview)}
        <span className="tiny">{previewNote(preview)}</span>
        {record && (
          <span className="record-chip" role="img" aria-label={recordChipLabel(record)}>
            {recordChipText(record)}
          </span>
        )}
      </span>
      <button
        ref={doneButton}
        type="button"
        className={`button done-toggle ${set.done ? 'selected' : ''}`}
        aria-pressed={set.done}
        aria-label={doneLabel}
        onClick={onToggleDone}
      >
        <Icon name="check" size={20} strokeWidth={3} />
      </button>
      <button
        type="button"
        className={`button done-toggle warmup-toggle ${set.isWarmup ? 'selected' : ''}`}
        aria-pressed={set.isWarmup}
        aria-label={`Warm-up set ${setNumber}`}
        onClick={() => onChange({ isWarmup: !set.isWarmup })}
      >
        W
      </button>
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
      {barbell !== null && calculatorOpen && (
        <PlateCalculator
          id={calculatorId}
          setNumber={setNumber}
          setup={barbell.setup}
          highestLoadKg={HIGHEST_LOAD_KG}
          unit={unit}
          weightKg={set.weightKg}
          onUse={(weightKg) => onChange({ weightKg })}
        />
      )}
      <button type="button" className="button icon" aria-label={`Remove set ${setNumber}`} onClick={onRemove}>
        ✕
      </button>
      <EffortSelector
        mode={effortMode}
        selected={set.effort}
        assumed={estimatedRir === null ? null : assumedEffort(effortMode, estimatedRir, DEFAULT_BALANCE.effortLevelRir)}
        onSelect={(effort) => onChange(effort === null ? { effort } : { effort, done: true })}
      />
    </li>
  );
}
