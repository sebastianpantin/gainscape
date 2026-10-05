import { useState } from 'react';
import { barbellPlatesText, nearestLoadable } from '../../lib/plate-rules.ts';
import type { DraftBarbellSetup } from '../../lib/program-set-rules.ts';
import type { UnitPref } from '../../lib/profile.ts';
import { highestWeightInUnit, shownWeight, unitToKg, WEIGHT_INPUT_STEP } from '../../lib/units.ts';

interface PlateCalculatorProps {
  id: string;
  setNumber: number;
  setup: DraftBarbellSetup;
  highestLoadKg: number;
  unit: UnitPref;
  weightKg: number;
  onUse: (weightKg: number) => void;
}

export function PlateCalculator({ id, setNumber, setup, highestLoadKg, unit, weightKg, onUse }: PlateCalculatorProps) {
  const shown = shownWeight(weightKg, unit);
  const highest = highestWeightInUnit(highestLoadKg, unit);
  const [targetText, setTargetText] = useState(() => String(shown));
  const target = Number(targetText);
  const validTarget = targetText.trim() !== '' && Number.isFinite(target) && target >= 0 && target <= highest;
  const nearest = validTarget ? nearestLoadable(target, setup.barWeight, setup.plates) : null;
  const usable = nearest !== null && nearest <= highest;
  const barText = setup.barFromProgram
    ? `${setup.barWeight} ${unit} bar from your program. Change the plates in Settings.`
    : `${setup.barWeight} ${unit} bar. Change the bar and plates in Settings.`;
  return (
    <div id={id} className="plate-calculator stack" role="group" aria-label={`Plate calculator, set ${setNumber}`}>
      <label className="compact-field">
        Target {unit}
        <input
          type="number"
          inputMode="decimal"
          min={0}
          max={highest}
          step={WEIGHT_INPUT_STEP}
          value={targetText}
          onChange={(event) => setTargetText(event.target.value)}
        />
      </label>
      <p className="tiny" role="status">
        {validTarget ? barbellPlatesText(target, setup, unit) : `Enter a weight up to ${highest} ${unit}`}
      </p>
      <span className="hint">{barText}</span>
      {usable && (
        <button
          type="button"
          className="button"
          disabled={nearest === shown}
          onClick={() => onUse(unitToKg(nearest, unit))}
        >
          {`Use ${nearest} ${unit}`}
        </button>
      )}
    </div>
  );
}
