import { roundTo } from '@domain/math.ts';
import { CARDIO_BOUNDS } from '@domain/cardio.ts';
import { useState } from 'react';
import type { PaceUnit } from '../../lib/catalog-rules.ts';
import {
  type BoutMode,
  boutModeChanges,
  clampedInterval,
  clampedSteadyDurationS,
  distanceFromInput,
} from '../../lib/cardio-rules.ts';
import type { UnitPref } from '../../lib/profile.ts';
import { distanceInputStep, distanceUnitFor, shownDistance } from '../../lib/units.ts';
import type { BoutValues } from '../../offline/draft-format.ts';

const SECONDS_PER_MINUTE = 60;
const SHOWN_MINUTE_DECIMALS = 1;

interface BoundedNumberFieldProps {
  label: string;
  value: number | null;
  min: number;
  max: number;
  step: number;
  inputMode: 'numeric' | 'decimal';
  emptyAllowed?: boolean;
  onCommit: (value: number | null, settled: boolean) => void;
}

function parsed(raw: string): number | null {
  return raw.trim() === '' ? null : Number(raw);
}

function BoundedNumberField({
  label,
  value,
  min,
  max,
  step,
  inputMode,
  emptyAllowed = false,
  onCommit,
}: BoundedNumberFieldProps) {
  const [typed, setTyped] = useState<string | null>(null);
  const isAcceptable = (candidate: number | null) =>
    candidate === null ? emptyAllowed : Number.isFinite(candidate) && candidate >= min && candidate <= max;
  const settle = () => {
    if (typed === null) return;
    const candidate = parsed(typed);
    if (candidate === null) {
      if (emptyAllowed) onCommit(null, true);
    } else if (Number.isFinite(candidate)) onCommit(Math.min(max, Math.max(min, candidate)), true);
    setTyped(null);
  };
  return (
    <label className="compact-field">
      {label}
      <input
        type="number"
        inputMode={inputMode}
        min={min}
        max={max}
        step={step}
        value={typed ?? (value === null ? '' : String(value))}
        onChange={(event) => {
          setTyped(event.target.value);
          const candidate = parsed(event.target.value);
          if (isAcceptable(candidate)) onCommit(candidate, false);
        }}
        onBlur={settle}
      />
    </label>
  );
}

interface BoutFieldsProps {
  bout: BoutValues;
  paceUnit: PaceUnit;
  unit: UnitPref;
  onChange: (changes: Partial<BoutValues>) => void;
}

export function BoutFields({ bout, paceUnit, unit, onChange }: BoutFieldsProps) {
  const distanceUnit = distanceUnitFor(unit, paceUnit);
  const { interval } = bout;
  const changeInterval = (changes: Partial<NonNullable<BoutValues['interval']>>, settled: boolean) => {
    if (interval === null) return;
    const typed = { ...interval, ...changes };
    const fitted = clampedInterval(typed);
    if (settled || fitted.rounds === typed.rounds) onChange({ interval: fitted });
  };
  return (
    <div className="bout-fields">
      {interval === null ? (
        <BoundedNumberField
          label="min"
          value={roundTo(SHOWN_MINUTE_DECIMALS, bout.durationS / SECONDS_PER_MINUTE)}
          min={CARDIO_BOUNDS.steadyDurationS.min / SECONDS_PER_MINUTE}
          max={CARDIO_BOUNDS.steadyDurationS.max / SECONDS_PER_MINUTE}
          step={1}
          inputMode="decimal"
          onCommit={(minutes) =>
            minutes !== null && onChange({ durationS: clampedSteadyDurationS(minutes * SECONDS_PER_MINUTE) })
          }
        />
      ) : (
        <>
          <BoundedNumberField
            label="rounds"
            value={interval.rounds}
            min={CARDIO_BOUNDS.intervalRounds.min}
            max={CARDIO_BOUNDS.intervalRounds.max}
            step={1}
            inputMode="numeric"
            onCommit={(rounds, settled) => rounds !== null && changeInterval({ rounds }, settled)}
          />
          <BoundedNumberField
            label="work s"
            value={interval.workS}
            min={CARDIO_BOUNDS.intervalWorkS.min}
            max={CARDIO_BOUNDS.intervalWorkS.max}
            step={5}
            inputMode="numeric"
            onCommit={(workS, settled) => workS !== null && changeInterval({ workS }, settled)}
          />
          <BoundedNumberField
            label="rest s"
            value={interval.restS}
            min={CARDIO_BOUNDS.intervalRestS.min}
            max={CARDIO_BOUNDS.intervalRestS.max}
            step={5}
            inputMode="numeric"
            onCommit={(restS, settled) => restS !== null && changeInterval({ restS }, settled)}
          />
        </>
      )}
      <BoundedNumberField
        label={distanceUnit}
        value={bout.distanceM === null ? null : shownDistance(bout.distanceM, distanceUnit)}
        min={0}
        max={shownDistance(CARDIO_BOUNDS.distanceM.max, distanceUnit)}
        step={distanceInputStep(distanceUnit)}
        inputMode="decimal"
        emptyAllowed
        onCommit={(distance) => onChange({ distanceM: distanceFromInput(distance, distanceUnit) })}
      />
    </div>
  );
}

const BOUT_MODES: { mode: BoutMode; label: string }[] = [
  { mode: 'steady', label: 'Steady' },
  { mode: 'intervals', label: 'Intervals' },
];

interface BoutModeToggleProps {
  boutNumber: number;
  bout: Pick<BoutValues, 'durationS' | 'interval'>;
  onChange: (changes: Partial<BoutValues>) => void;
}

export function BoutModeToggle({ boutNumber, bout, onChange }: BoutModeToggleProps) {
  const current: BoutMode = bout.interval === null ? 'steady' : 'intervals';
  return (
    <div className="bout-mode choice-pair" role="radiogroup" aria-label={`Bout ${boutNumber} type`}>
      {BOUT_MODES.map(({ mode, label }) => (
        <button
          key={mode}
          type="button"
          role="radio"
          aria-checked={mode === current}
          className={`effort-option ${mode === current ? 'selected' : ''}`}
          onClick={() => onChange(boutModeChanges(bout, mode))}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
