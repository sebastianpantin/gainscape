import { useId } from 'react';
import { HEAVIEST_BAR_OR_PLATE, PLATE_CHOICES } from '../../../lib/plate-rules.ts';
import { type UnitPref } from '../../../lib/profile.ts';
import { usePlateSetup } from './use-plate-setup.ts';

export function PlateChoices({ userId, unit }: { userId: string; unit: UnitPref }) {
  const { setup, barText, barValid, changeBar, togglePlate } = usePlateSetup(userId, unit);
  const platesLabelId = useId();
  const barHintId = useId();
  return (
    <>
      <label className="field">
        {`Bar weight (${unit})`}
        <input
          type="number"
          inputMode="decimal"
          min={0}
          max={HEAVIEST_BAR_OR_PLATE}
          step={0.5}
          value={barText}
          aria-invalid={!barValid}
          aria-describedby={barValid ? undefined : barHintId}
          onChange={(event) => changeBar(event.target.value)}
        />
      </label>
      {!barValid && (
        <span className="problem tiny" id={barHintId}>
          {`Enter a bar weight above 0 and up to ${HEAVIEST_BAR_OR_PLATE} ${unit}. Using ${setup.barWeight} ${unit}.`}
        </span>
      )}
      <div className="stack" style={{ gap: 6 }}>
        <span className="field" id={platesLabelId}>{`Plates you have (${unit})`}</span>
        <div className="segmented plate-choices" role="group" aria-labelledby={platesLabelId}>
          {PLATE_CHOICES[unit].map((plate) => {
            const owned = setup.plates.includes(plate);
            return (
              <button
                key={plate}
                type="button"
                className={owned ? 'segment active' : 'segment'}
                aria-pressed={owned}
                onClick={() => togglePlate(plate)}
              >
                {plate}
              </button>
            );
          })}
        </div>
      </div>
      <span className="hint">
        Barbell sets show plates per side and warm-ups with this bar and these plates. A followed program's workouts use
        the program's bar. Saved on this device only.
      </span>
    </>
  );
}
