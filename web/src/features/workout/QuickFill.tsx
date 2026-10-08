import { useState } from 'react';
import { HIGHEST_REPS, LOWEST_REPS, wholeNumberWithin } from '../../lib/units.ts';

const MOST_SETS = 20;

interface QuickFillProps {
  defaultSets: number;
  defaultReps: number;
  onFill: (sets: number, reps: number) => void;
}

export function QuickFill({ defaultSets, defaultReps, onFill }: QuickFillProps) {
  const [sets, setSets] = useState(String(defaultSets));
  const [reps, setReps] = useState(String(defaultReps));
  const setCount = wholeNumberWithin(sets, 1, MOST_SETS);
  const repCount = wholeNumberWithin(reps, LOWEST_REPS, HIGHEST_REPS);
  return (
    <fieldset className="quick-fill">
      <legend>Quick fill</legend>
      <label className="compact-field">
        sets
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={MOST_SETS}
          step={1}
          value={sets}
          onChange={(event) => setSets(event.target.value)}
        />
      </label>
      <span aria-hidden="true">×</span>
      <label className="compact-field">
        reps
        <input
          type="number"
          inputMode="numeric"
          min={LOWEST_REPS}
          max={HIGHEST_REPS}
          step={1}
          value={reps}
          onChange={(event) => setReps(event.target.value)}
        />
      </label>
      <button
        className="button"
        type="button"
        disabled={setCount === null || repCount === null}
        onClick={() => {
          if (setCount !== null && repCount !== null) onFill(setCount, repCount);
        }}
      >
        Fill
      </button>
    </fieldset>
  );
}
